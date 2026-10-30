// Catalog-wide generalization of propagateGcdIdByCvVolume.js (fixes volumes
// already split across multiple series_gcd_id values) and
// repairFeaturedSeriesCoverage.js (fixes volumes entirely on ONE wrong
// gcd_id, scoped to the 79 curated FEATURED_SERIES). This runs the same
// issue-overlap scoring against every ComicVine volume in canonical_covers,
// not just featured picks or already-visibly-conflicted ones.
//
// Root cause (see docs/cover-ingestion-audit-findings.md and project memory
// for the full incident list, 2026-08-25): GCD carries many distinct series
// entries sharing an identical title — foreign reprints, book-club editions,
// unrelated one-shots ("Ultimate Spider-Man" alone has 30 gcd_series rows
// under Marvel). Title-only resolution during ingest can land on a
// different one of those entries each run even though ComicVine's own
// volume match stays correct and consistent.
//
// Two-pass approach for efficiency across ~107k+ covers:
//   Pass 1 (cheap): for every volume, check whether its EXISTING tag(s)
//     already resolve cleanly (single consistent series_gcd_id, >=85%
//     overlap against that gcd_id's real gcd_issues). Skip — no work needed.
//   Pass 2 (only for volumes that fail pass 1): expand the candidate pool
//     to EVERY gcd_series row sharing the volume's series_title, not just
//     gcd_ids already tagged somewhere in the volume, then score all of them.
//
// 2026-10-29: production scored 1,773 unresolved volumes but resolved only
// four: 1,053 missed the 85% overlap gate, 446 were within the 15-point
// ambiguity margin, and 271 lost to a different-start-year winner. Skipped
// volumes now get two conservative retries: publisher breaks overlap ties;
// exact normalized title + publisher + start year can accept >=60% overlap.
//
// Usage:
//   node scripts/repairAllCoverSeriesLinks.js --dry-run
//   node scripts/repairAllCoverSeriesLinks.js

import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";
import { chooseSkippedCandidate, publisherMatches } from "./lib/publisherMatch.js";
import { withRetry } from "./lib/withRetry.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
// --plan-json=<path>: write the full relink plan (every volume, its current
// gcd_id(s), the winner, overlap, runner-up and row ids) so a human can audit
// what would move before it moves. Added 2026-09-21 when the first
// full-data dry run proposed ~6,600 rows and the "Top 20" summary was not
// enough to judge them.
const PLAN_JSON = (process.argv.find((a) => a.startsWith("--plan-json=")) ?? "").split("=")[1] || null;
const OVERLAP_THRESHOLD = 0.85;
const MIN_MARGIN = 0.15;
// Year gate (added 2026-09-21). Overlap is computed on issue NUMBERS only, so
// a 2020 volume numbered #1-50 overlaps a 1988 run numbered #1-189 at 100%
// and can beat the correct 2020 series on margin alone. The first full-data
// dry run (after the fetchIssueSets pagination fix) proposed 199 relinks; a
// year audit found 27 of them (1,037 covers) landing on a run whose
// publication years don't even intersect the covers' (Titans 2023 -> a
// 2008 series, Dick Tracy 2024 -> 1951, Star Wars 2015 -> the 1977 run).
// Rule: the candidate series must have been in publication when the volume
// started. `began - YEAR_PAD <= volumeStart <= ended`. The pad only covers
// off-by-one dating on the start side; there is deliberately no pad on the
// end side, because the second audit showed runs that ended the year before
// a volume began (Transformers 2019-2022 for a 2023 volume, X-O Manowar
// 2012-2016 for a 2017 volume) slipping through a symmetric pad and
// displacing links that were already correct. Volumes or series with no
// year data are not gated (same behaviour as before).
const YEAR_PAD = 1;
const PAGE = 1000;

// Two paging modes.
// - keyCol given: keyset paging (`WHERE keyCol > last ORDER BY keyCol LIMIT
//   1000`). Every page costs the same. Use for the big whole-table walks;
//   the select must include keyCol and the caller must not add .order().
// - no keyCol: offset paging via .range(). Fine for a few pages, but on a
//   122k-row walk page 100 measured 8.2s on 2026-09-22 (offset makes
//   Postgres scan and discard everything before it) and tripped the
//   statement timeout in the hourly health check. Keyset walked the same
//   table at 1.1s worst page.
//
// Every page also retries a transient failure, which the sibling scripts
// already did and this one did not. Measured 2026-09-25 across 100 hourly
// runs: the stall check, the nightly report and the value snapshot all
// retry, and all pass; this script had no retry and was the entire residual
// failure rate of the cover-ingest workflow. One statement timeout on one
// page threw away the whole walk — 126 pages and 36 seconds of work — and
// turned a run red that had already ingested covers successfully.
//
// Retry is the right shape for an isolated blip, not for a bad afternoon.
// On 2026-09-22 the database timed out across every workflow for roughly an
// hour, and the scripts that DO retry exhausted all four attempts and failed
// anyway. This does not pretend to fix that; it stops one unlucky page from
// costing a run.
async function fetchAllPages(build, keyCol) {
  const rows = [];
  if (keyCol) {
    let last = null;
    let page = 0;
    for (;;) {
      const at = last;
      const data = await withRetry(`keyset page ${page} (after ${at ?? "start"})`, () => {
        let query = build().order(keyCol, { ascending: true }).limit(PAGE);
        if (at != null) query = query.gt(keyCol, at);
        return query;
      });
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
      last = data[data.length - 1][keyCol];
      page += 1;
    }
    return rows;
  }
  for (let from = 0; ; from += PAGE) {
    const data = await withRetry(`page (from=${from})`, () =>
      build().range(from, from + PAGE - 1)
    );
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// THIRD BUG, FOUND LIVE 2026-09-21: this was one unpaginated .in() over 500
// series at a time, so PostgREST handed back at most 1000 gcd_issues rows
// per chunk with no error and (with no ORDER BY) no guarantee which 1000.
// 500 series hold far more than 1000 issues, so most candidates' issue
// sets came back partial or missing entirely, and *which* ones depended on
// the rest of the chunk. Reproduced against production: a chunk holding
// both GCD 614 (Superboy 1949) and 4973 (Superboy 1994) returned 171 of
// 614's issues and zero of 4973's. That is why the hourly Auto-repair
// step relinked two Superboy volumes to 4973 at "100% overlap, no
// runner-up" and the health check 47 seconds later relinked them to 614 at
// "100% overlap, no runner-up": each pass saw only one of the two. The
// 15-point ambiguity guard cannot fire on a candidate it never loaded. It
// also means the "no candidate cleared 85%" skip count has been inflated
// by candidates whose issue lists were simply never read.
// Fix: page every chunk to completion with a stable order, same as the
// two fetches above.
//
// Ordering matters for more than determinism. The first version of this
// fix ordered by gcd_id (the primary key) in 100-series chunks and the
// health check hit Postgres 57014 (statement timeout) on its first hourly
// run: with an IN filter plus ORDER BY the PK, the planner can walk the PK
// index and filter, which at deep offsets scans millions of rows. Measured
// on a real 100-series chunk: worst page 4.5s ordered by gcd_id vs 0.85s
// ordered by (series_gcd_id, gcd_id), and 0.16s with 25-series chunks.
// series_gcd_id is the filtered column, so leading the sort with it keeps
// the planner on that index.
async function fetchIssueSets(gcdIds) {
  const map = new Map();
  const ids = [...new Set(gcdIds)].filter((v) => v != null);
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const data = await fetchAllPages(() =>
      supabase.from("gcd_issues").select("series_gcd_id, issue_number").in("series_gcd_id", chunk)
        .order("series_gcd_id").order("gcd_id")
    );
    for (const row of data) {
      const key = row.series_gcd_id;
      const base = baseIssueNumber(row.issue_number);
      if (base == null) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(base);
    }
  }
  return map;
}

// The volume's start year: the most common series_year on its rows (that
// column carries the ComicVine volume's start year), falling back to the
// earliest cover_date year. Null when nothing usable is present.
function volumeStartYear(rows) {
  const counts = new Map();
  let earliestCover = null;
  for (const r of rows) {
    const sy = Number(r.series_year);
    if (sy > 1800 && sy < 2200) counts.set(sy, (counts.get(sy) ?? 0) + 1);
    const cy = Number(String(r.cover_date ?? "").slice(0, 4));
    if (cy > 1800 && cy < 2200 && (earliestCover == null || cy < earliestCover)) earliestCover = cy;
  }
  if (counts.size) return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  return earliestCover;
}

function yearsCompatible(volStart, series) {
  if (!volStart || !series || !series.began) return true; // no data, no gate
  return volStart >= series.began - YEAR_PAD && volStart <= (series.ended ?? 9999);
}

function overlapOf(volumeIssueNumbers, candidateIssueSet) {
  if (!candidateIssueSet || candidateIssueSet.size === 0) return 0;
  let matched = 0;
  for (const n of volumeIssueNumbers) if (candidateIssueSet.has(n)) matched++;
  return matched / volumeIssueNumbers.size;
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null, bestCount = -1;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

// BUG FOUND AND FIXED LIVE 2026-08-27: the first version of this function
// built a naive `Map<volume, gcd_id>` — when more than one `series` row
// pins the SAME comicvine_volume_id to DIFFERENT gcd_ids (a pre-existing
// duplicate-series data problem: 448 distinct volumes confirmed to have
// genuinely conflicting pins, e.g. ComicVine volume 796 "Batman" 1940 had
// TWELVE different series rows each pinned to a different gcd_id), the
// LAST row the DB happened to return silently won — non-deterministic
// between runs, since no ORDER BY made that order stable. That bad
// assumption already got applied for real once (30,454 rows, including
// Batman, Spider-Man, Superman) before this was caught, live, by the
// smoke test suite immediately after — see scripts/resolveAmbiguousPins.js
// for the year-cross-referenced remediation of that damage.
//
// Fix: a pin is only trustworthy when it's UNIQUE. A volume with multiple
// DISTINCT candidate gcd_ids is excluded from this map entirely and falls
// through to the overlap-scoring logic below instead — the same safety net
// this script already relied on before pins existed at all.
//
// SECOND BUG FOUND LIVE 2026-08-28, same run as the fix above: this fetch
// had no .order() on it, unlike the canonical_covers fetch in run() below.
// fetchAllPages() paginates with .range(from, from+999) — without a stable
// sort, Postgres doesn't guarantee those page boundaries stay put while the
// `series` table is being concurrently written to (new series rows land
// continuously from live ingest and backfill scripts). A row landing on
// the wrong side of a shifting page boundary gets silently skipped, which
// can make a genuinely ambiguous volume look unambiguous for one run and
// correctly ambiguous the next — this is what caused the same title
// (Fightin' Army) to resolve to two different gcd_ids in back-to-back
// invocations minutes apart. Ordering by id makes pagination deterministic
// regardless of concurrent writes elsewhere in the table.
async function fetchPinnedGcdIdByVolume() {
  const rows = await fetchAllPages(() =>
    supabase.from("series").select("id, comicvine_volume_id, gcd_id")
      .not("comicvine_volume_id", "is", null).not("gcd_id", "is", null),
  "id");
  const candidatesByVolume = new Map();
  for (const row of rows) {
    if (!candidatesByVolume.has(row.comicvine_volume_id)) {
      candidatesByVolume.set(row.comicvine_volume_id, new Set());
    }
    candidatesByVolume.get(row.comicvine_volume_id).add(row.gcd_id);
  }
  const map = new Map();
  let ambiguousSkipped = 0;
  for (const [volume, gcdIds] of candidatesByVolume) {
    if (gcdIds.size === 1) {
      map.set(volume, [...gcdIds][0]);
    } else {
      ambiguousSkipped++;
    }
  }
  console.log(`  (${ambiguousSkipped} volume(s) have conflicting pins across multiple series rows — excluded, falls through to overlap-scoring)`);
  return map;
}

async function run() {
  console.log("Loading all covers with a comicvine_volume_id...");
  const covers = await fetchAllPages(() =>
    supabase.from("canonical_covers").select("id, comicvine_volume_id, series_gcd_id, gcd_issue_id, issue_number, series_title, series_year, cover_date, publisher")
      .not("comicvine_volume_id", "is", null).not("storage_path", "is", null),
  "id");
  console.log(`Covers loaded: ${covers.length}`);

  const byVolume = new Map();
  for (const c of covers) {
    if (!byVolume.has(c.comicvine_volume_id)) byVolume.set(c.comicvine_volume_id, []);
    byVolume.get(c.comicvine_volume_id).push(c);
  }
  console.log(`Distinct ComicVine volumes: ${byVolume.size}`);

  // A confirmed series.comicvine_volume_id pin is a STRONGER signal than
  // issue overlap — it's a human/prior-repair-verified "this exact ComicVine
  // volume is this exact GCD series," and comicvine_api_to_supabase.py
  // already treats it as authoritative (_lookup_gcd_id_by_pinned_volume,
  // checked before its own fuzzy title fallback). This script didn't know
  // about pins at all until 2026-08-27, when Absolute Batman's real,
  // pin-correct link (series_gcd_id 226633 — GCD's own metadata for it only
  // ever synced issue #1, so its overlap against the volume's 23 real covers
  // was a mere 4%) got silently overridden by an UNPINNED duplicate-title
  // GCD entry (216143, 11 issues, 48% overlap — still under the 85%
  // threshold, but the highest-scoring wrong answer available once 226633's
  // own low overlap put it in "needs resolution" in the first place). A pin
  // now short-circuits both the overlap-based "already clean" check AND the
  // candidate-scoring loop below — it wins regardless of overlap, full stop.
  console.log("Loading confirmed series.comicvine_volume_id pins...");
  const pinnedGcdIdByVolume = await fetchPinnedGcdIdByVolume();
  console.log(`Pinned volumes: ${pinnedGcdIdByVolume.size}`);

  // Pass 1: cheap check against currently-existing tags only.
  const existingTagIds = [...new Set(covers.map((c) => c.series_gcd_id).filter((v) => v != null))];
  console.log(`Distinct series_gcd_id values currently in use: ${existingTagIds.length}`);
  const issueSets = await fetchIssueSets(existingTagIds);

  const needsResolution = [];
  let alreadyClean = 0;
  let pinnedRelinks = 0;
  let pinnedRelinkRows = 0;
  const plan = [];
  // Single-book series: trades, graphic novels, one-shots. GCD numbers them
  // "[nn]" and ComicVine numbers them "1", so overlap against their own
  // series is 0% and a same-titled numbered run wins at 100%. The 2026-10-25
  // 00:00 run moved the Resurrection of Magneto TPB cover onto the 4-issue
  // mini that way, while its gcd_issue_id still pointed at the trade, and
  // the moved row then looked clean (#1 overlaps the mini 100%). For a
  // one-issue volume whose gcd_issue_id belongs to a series with no
  // numbered issues at all, number overlap cannot judge it and the link
  // decides. Limited to unnumbered series on purpose: mis-pinned volumes also
  // carry gcd_issue_ids, inside the wrong series, and must still be scored.
  const singleBookVolumes = [...byVolume].filter(([volume, rows]) =>
    !pinnedGcdIdByVolume.has(volume)
    && new Set(rows.map((r) => baseIssueNumber(r.issue_number))).size === 1
    && rows.every((r) => r.gcd_issue_id != null));
  const linkedIssueIds = [...new Set(singleBookVolumes.flatMap(([, rows]) => rows.map((r) => r.gcd_issue_id)))];
  const seriesOfIssue = new Map();
  for (let i = 0; i < linkedIssueIds.length; i += 500) {
    const data = await fetchAllPages(() =>
      supabase.from("gcd_issues").select("gcd_id, series_gcd_id").in("gcd_id", linkedIssueIds.slice(i, i + 500)).order("gcd_id")
    );
    for (const row of data) seriesOfIssue.set(Number(row.gcd_id), row.series_gcd_id);
  }
  const owners = [...new Set(seriesOfIssue.values())].filter((id) => id != null);
  const ownerNumbered = await fetchIssueSets(owners);
  let singleBookRelinks = 0;
  let singleBookRows = 0;
  const singleBookHandled = new Set();
  for (const [volume, rows] of singleBookVolumes) {
    const owner = new Set(rows.map((r) => seriesOfIssue.get(Number(r.gcd_issue_id))));
    if (owner.size !== 1) continue;
    const [ownerId] = owner;
    if (ownerId == null || ownerNumbered.get(ownerId)?.size) continue;
    singleBookHandled.add(volume);
    const rowsToFix = rows.filter((r) => r.series_gcd_id !== ownerId);
    if (!rowsToFix.length) { alreadyClean++; continue; }
    singleBookRelinks++;
    singleBookRows += rowsToFix.length;
    plan.push({
      volume, title: mode(rows.map((r) => r.series_title)), winner: ownerId, overlap: null,
      reason: "single-book link", volumePublisher: mode(rows.map((r) => r.publisher).filter(Boolean)),
      runnerUp: null, rowIds: rowsToFix.map((r) => r.id),
    });
  }

  for (const [volume, rows] of byVolume) {
    if (singleBookHandled.has(volume)) continue;
    const volIssueNumbers = new Set(rows.map((r) => baseIssueNumber(r.issue_number)).filter(Boolean));
    if (volIssueNumbers.size === 0) continue;

    const pinnedGcdId = pinnedGcdIdByVolume.get(volume);
    if (pinnedGcdId != null) {
      const rowsToFix = rows.filter((r) => r.series_gcd_id !== pinnedGcdId);
      if (rowsToFix.length > 0) {
        pinnedRelinks++;
        pinnedRelinkRows += rowsToFix.length;
        plan.push({
          volume,
          title: mode(rows.map((r) => r.series_title)),
          winner: pinnedGcdId,
          overlap: null, // pin-driven, not overlap-scored
          reason: "pinned",
          volumePublisher: mode(rows.map((r) => r.publisher).filter(Boolean)),
          runnerUp: null,
          rowIds: rowsToFix.map((r) => r.id),
        });
      } else {
        alreadyClean++;
      }
      continue;
    }

    const distinctTags = new Set(rows.map((r) => r.series_gcd_id).filter((v) => v != null));
    if (distinctTags.size === 1) {
      const [onlyTag] = distinctTags;
      const allTagged = rows.every((r) => r.series_gcd_id === onlyTag);
      if (allTagged && overlapOf(volIssueNumbers, issueSets.get(onlyTag)) >= OVERLAP_THRESHOLD) {
        alreadyClean++;
        continue;
      }
    }
    needsResolution.push({
      volume, rows, volIssueNumbers,
      title: mode(rows.map((r) => r.series_title)),
      publisher: mode(rows.map((r) => r.publisher).filter(Boolean)),
      startYear: volumeStartYear(rows),
    });
  }
  console.log(`Already clean (skip): ${alreadyClean}`);
  console.log(`Pin-driven relinks: ${pinnedRelinks} volumes, ${pinnedRelinkRows} rows`);
  console.log(`Single-book relinks (gcd_issue_id on an unnumbered series): ${singleBookRelinks} volumes, ${singleBookRows} rows`);
  console.log(`Needs resolution (unpinned, overlap-scored): ${needsResolution.length}`);

  // Pass 2: expand candidates via gcd_series title match for volumes that
  // didn't resolve cleanly against their existing tag(s).
  const titles = [...new Set(needsResolution.map((v) => v.title).filter(Boolean))];
  console.log(`Distinct series_title values needing candidate expansion: ${titles.length}`);

  const candidatesByTitle = new Map();
  const seriesMeta = new Map();
  for (let i = 0; i < titles.length; i += 200) {
    const chunk = titles.slice(i, i + 200);
    // Paged: 200 common titles can match well over 1000 gcd_series rows.
    const data = await fetchAllPages(() =>
      supabase.from("gcd_series").select("gcd_id, name, year_began, year_ended, publisher_gcd_id").in("name", chunk).order("name").order("gcd_id")
    );
    for (const row of data) {
      if (!candidatesByTitle.has(row.name)) candidatesByTitle.set(row.name, []);
      candidatesByTitle.get(row.name).push(row.gcd_id);
      seriesMeta.set(row.gcd_id, row);
    }
  }
  // Existing-tag candidates were not part of the title lookup; fetch their years too.
  const untimedIds = [...new Set(needsResolution.flatMap((v) => v.rows.map((r) => r.series_gcd_id)))].filter((id) => id != null && !seriesMeta.has(id));
  for (let i = 0; i < untimedIds.length; i += 200) {
    const data = await fetchAllPages(() =>
      supabase.from("gcd_series").select("gcd_id, name, year_began, year_ended, publisher_gcd_id").in("gcd_id", untimedIds.slice(i, i + 200)).order("gcd_id")
    );
    for (const row of data) seriesMeta.set(row.gcd_id, row);
  }

  // Sequential chunk reads stay well below the four-request disk IO budget.
  const publisherIds = [...new Set([...seriesMeta.values()]
    .map((row) => row.publisher_gcd_id).filter((id) => id != null))];
  const publishers = new Map();
  for (let i = 0; i < publisherIds.length; i += 200) {
    const data = await fetchAllPages(() => supabase.from("gcd_publishers")
      .select("gcd_id, name, country").in("gcd_id", publisherIds.slice(i, i + 200)).order("gcd_id"));
    for (const row of data) publishers.set(row.gcd_id, row);
  }

  const newCandidateIds = new Set();
  for (const v of needsResolution) {
    for (const gcdId of candidatesByTitle.get(v.title) ?? []) {
      if (!issueSets.has(gcdId)) newCandidateIds.add(gcdId);
    }
  }
  console.log(`New candidate gcd_ids to fetch issue lists for: ${newCandidateIds.size}`);
  const newIssueSets = await fetchIssueSets([...newCandidateIds]);
  for (const [k, v] of newIssueSets) issueSets.set(k, v);

  // Score every needs-resolution volume against ALL candidates (existing
  // tags + title-expansion pool). `plan` already holds pin-driven relinks
  // from the loop above — this appends the overlap-scored ones to the same
  // array so the summary and apply step below cover both in one pass.
  let resolved = 0, skippedNoCandidate = 0, skippedAmbiguous = 0, skippedSameYear = 0;
  let yearGated = 0, publisherTiebreaks = 0, titlePublisherYear = 0;
  let totalRowsToUpdate = pinnedRelinkRows + singleBookRows;
  for (const v of needsResolution) {
    const candidateIds = new Set([
      ...v.rows.map((r) => r.series_gcd_id).filter((x) => x != null),
      ...(candidatesByTitle.get(v.title) ?? []),
    ]);
    let best = null, second = null;
    const scoredCandidates = [];
    for (const gcdId of candidateIds) {
      const meta = seriesMeta.get(gcdId);
      if (!yearsCompatible(v.startYear, { began: meta?.year_began, ended: meta?.year_ended })) {
        yearGated++;
        continue;
      }
      const overlap = overlapOf(v.volIssueNumbers, issueSets.get(gcdId));
      scoredCandidates.push({ gcdId, overlap });
      if (!best || overlap > best.overlap) { second = best; best = { gcdId, overlap }; }
      else if (!second || overlap > second.overlap) { second = { gcdId, overlap }; }
    }
    let skipReason = null;
    if (!best || best.overlap < OVERLAP_THRESHOLD) skipReason = "no_candidate";
    else if (second && best.overlap - second.overlap < MIN_MARGIN) skipReason = "ambiguous";
    // If some candidate began the same year this volume started and it is
    // not the winner, do not move. The GCD mirror is thin on recent series,
    // so a brand-new run can score under 85% simply because its issues are
    // not indexed yet, and an older same-titled run then wins on numbers
    // (Avengers 2023 -> Avengers 2019-2024 in the 2026-09-21 audit).
    // Leaving the volume alone is the safe failure; a later mirror refresh
    // resolves it.
    if (!skipReason && v.startYear) {
      const sameYearOther = [...candidateIds].some(
        (gcdId) => gcdId !== best.gcdId && seriesMeta.get(gcdId)?.year_began === v.startYear
      );
      if (sameYearOther && seriesMeta.get(best.gcdId)?.year_began !== v.startYear) {
        skipReason = "same_start_year";
      }
    }

    let reason = "overlap";
    if (skipReason) {
      const candidates = scoredCandidates.map((candidate) => {
        const meta = seriesMeta.get(candidate.gcdId);
        const publisher = publishers.get(meta?.publisher_gcd_id);
        return {
          ...candidate,
          publisherName: publisher?.name ?? null,
          country: publisher?.country ?? null,
          name: meta?.name ?? null,
          yearBegan: meta?.year_began ?? null,
        };
      });
      const retry = chooseSkippedCandidate({
        skipReason, volumeTitle: v.title, volumePublisher: v.publisher, startYear: v.startYear,
        candidates, overlapThreshold: OVERLAP_THRESHOLD, minMargin: MIN_MARGIN,
      });
      if (!retry) {
        if (skipReason === "no_candidate") skippedNoCandidate++;
        else if (skipReason === "ambiguous") skippedAmbiguous++;
        else skippedSameYear++;
        continue;
      }
      // The same-start-year guard above still applies to a retry winner: a
      // publisher-matching series that began the year this volume started
      // and lost is the thin-mirror case, so leave the volume alone.
      const sameYearLoser = v.startYear && retry.winner.yearBegan !== v.startYear
        && candidates.some((candidate) => candidate.gcdId !== retry.winner.gcdId
          && candidate.yearBegan === v.startYear
          && publisherMatches(v.publisher, candidate.publisherName));
      if (sameYearLoser) { skippedSameYear++; continue; }
      best = { gcdId: retry.winner.gcdId, overlap: retry.winner.overlap };
      reason = retry.reason;
      if (reason === "publisher tiebreak") publisherTiebreaks++;
      else titlePublisherYear++;
    }

    // Split runs: ComicVine keeps Speed Comics #1-44 as one volume, GCD has
    // Brookwood #1-11 and Harvey #12-44 as two series. Moving every row to
    // the winner would strip covers that are right where they are, so a row
    // stays put when its number exists in its current series but not in the
    // winner's.
    const winnerSet = issueSets.get(best.gcdId);
    const rowsToFix = v.rows.filter((r) => {
      if (r.series_gcd_id === best.gcdId) return false;
      if (r.series_gcd_id == null) return true;
      const n = baseIssueNumber(r.issue_number);
      return !(issueSets.get(r.series_gcd_id)?.has(n) && !winnerSet?.has(n));
    });
    if (rowsToFix.length === 0) continue;
    resolved++;
    totalRowsToUpdate += rowsToFix.length;
    const auditRunnerUp = scoredCandidates
      .filter((candidate) => candidate.gcdId !== best.gcdId)
      .sort((a, b) => b.overlap - a.overlap)[0] ?? null;
    plan.push({
      volume: v.volume, title: v.title, winner: best.gcdId, overlap: best.overlap, reason,
      volumePublisher: v.publisher,
      winnerPublisher: publishers.get(seriesMeta.get(best.gcdId)?.publisher_gcd_id) ?? null,
      runnerUp: auditRunnerUp ? {
        gcdId: auditRunnerUp.gcdId,
        overlap: auditRunnerUp.overlap,
        publisherName: publishers.get(seriesMeta.get(auditRunnerUp.gcdId)?.publisher_gcd_id)?.name ?? null,
        country: publishers.get(seriesMeta.get(auditRunnerUp.gcdId)?.publisher_gcd_id)?.country ?? null,
      } : null,
      currentGcdIds: [...new Set(rowsToFix.map((r) => r.series_gcd_id))],
      rowIds: rowsToFix.map((r) => r.id),
    });
  }

  const missingWinnerIds = [...new Set(plan.map((entry) => entry.winner))]
    .filter((gcdId) => gcdId != null && !seriesMeta.has(gcdId));
  for (let i = 0; i < missingWinnerIds.length; i += 200) {
    const data = await fetchAllPages(() => supabase.from("gcd_series")
      .select("gcd_id, name, year_began, year_ended, publisher_gcd_id")
      .in("gcd_id", missingWinnerIds.slice(i, i + 200)).order("gcd_id"));
    for (const row of data) seriesMeta.set(row.gcd_id, row);
  }
  const missingPublisherIds = [...new Set(plan.map((entry) =>
    seriesMeta.get(entry.winner)?.publisher_gcd_id))]
    .filter((publisherId) => publisherId != null && !publishers.has(publisherId));
  for (let i = 0; i < missingPublisherIds.length; i += 200) {
    const data = await fetchAllPages(() => supabase.from("gcd_publishers")
      .select("gcd_id, name, country").in("gcd_id", missingPublisherIds.slice(i, i + 200)).order("gcd_id"));
    for (const row of data) publishers.set(row.gcd_id, row);
  }
  for (const entry of plan) {
    entry.winnerPublisher = publishers.get(seriesMeta.get(entry.winner)?.publisher_gcd_id) ?? null;
    entry.runnerUp ??= null;
  }

  console.log(
    `\nResolved: ${pinnedRelinks} volume(s) pin-driven (${pinnedRelinkRows} rows) + ` +
      `${resolved} volume(s) overlap-driven (${totalRowsToUpdate - pinnedRelinkRows} rows) = ` +
      `${totalRowsToUpdate} total rows to relink`
  );
  console.log(`Skipped — no candidate cleared ${OVERLAP_THRESHOLD * 100}% overlap: ${skippedNoCandidate}`);
  console.log(`Skipped — ambiguous (winner/runner-up within ${MIN_MARGIN * 100} points): ${skippedAmbiguous}`);
  console.log(`Candidates excluded by the year gate (series not in publication at the volume's start year): ${yearGated}`);
  console.log(`Skipped — a same-start-year series exists but did not win (GCD mirror likely thin): ${skippedSameYear}`);
  console.log(`Resolved by publisher tiebreak: ${publisherTiebreaks}`);
  console.log(`Resolved by title+publisher+year: ${titlePublisherYear}`);
  // Single machine-parseable line for checkCoverIngestHealth.js --mode=mislink
  // to regex out — added 2026-08-27 alongside the pin-priority feature above,
  // since that change also reworded the human-readable summary this used to
  // scrape directly. Keep this line's format stable even if the prose above
  // changes again.
  console.log(`TOTAL_RESOLVED_VOLUMES: ${pinnedRelinks + resolved}`);

  if (plan.length > 0) {
    console.log("\nTop 20 by rows affected:");
    for (const p of plan.sort((a, b) => b.rowIds.length - a.rowIds.length).slice(0, 20)) {
      const scoreLabel = p.reason ?? (p.overlap == null ? "pinned" : `overlap ${(p.overlap * 100).toFixed(0)}%`);
      console.log(`  ${p.title} -> series_gcd_id ${p.winner} (${scoreLabel}), ${p.rowIds.length} row(s)`);
    }
  }

  if (PLAN_JSON) {
    fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2));
    console.log(`Plan written to ${PLAN_JSON} (${plan.length} volumes)`);
  }
  if (DRY_RUN) {
    console.log("\n[dry-run] No writes performed.");
    return;
  }

  console.log("\nApplying...");
  let totalUpdated = 0;
  for (const p of plan) {
    for (let i = 0; i < p.rowIds.length; i += 500) {
      const chunk = p.rowIds.slice(i, i + 500);
      const { data, error } = await supabase.from("canonical_covers").update({ series_gcd_id: p.winner }).in("id", chunk).select("id");
      if (error) { console.error(`volume=${p.volume} error:`, error.message); continue; }
      totalUpdated += data?.length ?? 0;
    }
  }
  console.log(`\nDone. Rows updated: ${totalUpdated}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
