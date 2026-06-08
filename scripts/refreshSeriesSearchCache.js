// Populates the cached search columns on `series`:
//   issue_count_cached, year_start_cached, year_end_cached,
//   resolved_publisher_cached, featured_cover_path_cached, search_refreshed_at
//
// Processes rows where search_refreshed_at IS NULL in batches until done.
// To force a full rebuild:
//   UPDATE series SET search_refreshed_at = NULL;
// then rerun this script.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { resolvePublisher } from "../src/lib/publisher.js";
import { getSeriesOverride } from "../src/lib/seriesOverrides.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 100;
const FORCE = process.argv.includes("--force");

// --max-batches=<n> stops after N batches (≈BATCH_SIZE × N series). Useful
// for smoke-testing a change before committing to the full 217k-row pass.
// Cursor + --force still resume the rest later.
const MAX_BATCHES_ARG = process.argv.find((a) => a.startsWith("--max-batches="));
const MAX_BATCHES = MAX_BATCHES_ARG
  ? Number(MAX_BATCHES_ARG.split("=")[1])
  : Infinity;

// --dry-run computes everything but skips the DB write, logging the featured
// cover pick per series instead. Use it to verify a matcher change before
// committing it to the live cache.
const DRY_RUN = process.argv.includes("--dry-run");

// --only-ids=<uuid,uuid,...> processes exactly those series rows in a single
// batch and stops. Targeted re-refresh after a matcher fix, no full pass.
const ONLY_IDS_ARG = process.argv.find((a) => a.startsWith("--only-ids="));
const ONLY_IDS = ONLY_IDS_ARG
  ? ONLY_IDS_ARG.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean)
  : null;

// Wraps a Supabase query builder in a retry loop. Supabase's PostgREST
// occasionally surfaces transient errors that are safe to retry: 57014
// (statement_timeout), 53300 (too_many_connections), and plain network
// blips that come back as { message: 'fetch failed' }. Without this, one
// 8-second slow batch out of 2,000 kills the whole 217k-row pass and
// leaves you starting over (which is what just happened after the user
// stepped away during the run).
//
// Pass a thunk that returns a fresh Supabase query — we re-invoke it on
// each retry. Up to 4 attempts with 1s, 3s, 8s backoffs. Errors that
// aren't transient throw on the first attempt.
const TRANSIENT_CODES = new Set(["57014", "53300", "PGRST116", "ETIMEDOUT"]);
async function runWithRetry(label, thunk, maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, error } = await thunk();
      if (!error) return data;
      const code = error.code || "";
      const msg = (error.message || "").toLowerCase();
      const transient =
        TRANSIENT_CODES.has(code) ||
        msg.includes("statement timeout") ||
        msg.includes("fetch failed") ||
        msg.includes("network");
      if (!transient || attempt === maxAttempts) throw error;
      lastError = error;
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      const transient = msg.includes("fetch failed") || msg.includes("network") || msg.includes("timeout");
      if (!transient || attempt === maxAttempts) throw err;
      lastError = err;
    }
    const backoffMs = [1000, 3000, 8000][attempt - 1] ?? 8000;
    process.stdout.write(
      `\n  ⚠ ${label} transient error (attempt ${attempt}/${maxAttempts}): ${lastError?.message ?? lastError?.code ?? "?"} — retrying in ${backoffMs}ms\n`
    );
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw lastError;
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function isPlaceholderIssueNumber(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return true;
  return s === "[nn]" || s === "nn" || s === "(nn)";
}

// Strip variant/printing suffixes to get the canonical issue number.
//   "1"                 → "1"
//   "1 [Newsstand]"     → "1"
//   "1 [Variant Cover]" → "1"
//   "1A"                → "1"      (rare; 641 rows total per diagnostic)
//   "1.NOW"             → "1"      (rare; 101 rows total)
//   "5/1981"            → "5"      (foreign issue-by-year numbering)
//   "1.5"               → "1.5"    (kept — actual fractional issue, e.g. #0.5)
//   "Annual 1"          → null     (alpha-only; not a numbered issue)
//
// Returns null when there's no leading numeric base. The cache treats those
// rows as un-numbered specials and skips them in the issue count, which
// matches what users expect ("Annual" isn't part of "the run").
function baseIssueNumber(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Match leading int or decimal. Stop at any non-numeric character.
  const m = s.match(/^(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

// Best available year for a gcd_issues row. publication_date is the canonical
// field but it's null on ~65% of rows per the diagnostic. key_date is GCD's
// sortable approximation (often "YYYY-MM-DD" or "YYYY-00-00") that's
// populated more reliably. Try both before giving up.
function bestYearFor(row) {
  return parseYear(row.publication_date) ?? parseYear(row.key_date);
}

// Normalized title key for matching `series.title` against
// `canonical_covers.series_title`. GCD (which feeds `series`) tends to drop the
// leading article — "Flash", "Amazing Spider-Man" — while ComicVine (which
// feeds canonical_covers) keeps it — "The Flash", "The Amazing Spider-Man". A
// raw lowercased compare left 723 "The Flash" covers stranded from ~25 "Flash"
// series rows (and the same across the catalog), tanking coverage. Strip a
// leading "the " and collapse whitespace on BOTH sides so they line up. Kept
// conservative — the year-span scorer + per-volume `claimed` set still prevent
// a same-normalized-title cover from landing on the wrong era/volume.
function normTitle(value) {
  let s = String(value ?? "").trim().toLowerCase();
  if (s.startsWith("the ")) s = s.slice(4);
  return s.replace(/\s+/g, " ");
}

// In --force mode we walk the table by id cursor instead of filtering on
// search_refreshed_at, so the script can chew through everything without
// needing the giant UPDATE … SET search_refreshed_at = NULL to commit first.
// Tradeoff: id-ordered batches don't cluster volumes of the same title, so
// cross-volume cover claims only work within a single batch's title group
// (less effective than the normal mode's title-ordered batching).
// Cursor persistence for --force runs. When the script crashes mid-run
// (Supabase timeout, network blip, user closes terminal), the next launch
// reads this file and resumes from where it stopped. Beats redoing 100k+
// already-processed rows. File auto-deletes on clean completion.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
const CURSOR_FILE = path.resolve(__dirname, ".refresh-cursor");

let forceCursorId = null;
if (FORCE && existsSync(CURSOR_FILE)) {
  try {
    forceCursorId = readFileSync(CURSOR_FILE, "utf8").trim() || null;
    if (forceCursorId) {
      console.log(`Resuming --force from saved cursor: id > ${forceCursorId}`);
    }
  } catch {
    /* ignore — start from the beginning */
  }
}

function saveCursor(id) {
  if (!FORCE || !id) return;
  try {
    writeFileSync(CURSOR_FILE, String(id));
  } catch {
    /* persistence is best-effort; don't crash the script over it */
  }
}

function clearCursor() {
  try {
    if (existsSync(CURSOR_FILE)) unlinkSync(CURSOR_FILE);
  } catch {
    /* ignore */
  }
}

async function fetchSeriesBatch() {
  let query = supabase
    .from("series")
    .select(`
      id,
      gcd_id,
      title,
      cv_publisher,
      publisher:publisher_id (
        name,
        gcd_id
      )
    `)
    .not("gcd_id", "is", null);

  if (ONLY_IDS) {
    query = query.in("id", ONLY_IDS);
    const data = await runWithRetry("series batch fetch (only-ids)", () =>
      query.limit(BATCH_SIZE)
    );
    return data ?? [];
  }

  if (FORCE) {
    if (forceCursorId != null) {
      query = query.gt("id", forceCursorId);
    }
    query = query.order("id", { ascending: true });
  } else {
    query = query.is("search_refreshed_at", null).order("title", { ascending: true });
  }

  // Capture the query as a thunk so retries get a fresh request rather than
  // re-awaiting the same exhausted promise.
  const data = await runWithRetry("series batch fetch", () => query.limit(BATCH_SIZE));
  const rows = data ?? [];

  if (FORCE && rows.length > 0) {
    forceCursorId = rows[rows.length - 1].id;
    saveCursor(forceCursorId);
  }

  return rows;
}

function normalizePublisherForMatch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+comics?$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

async function processBatch(seriesBatch) {
  if (seriesBatch.length === 0) return 0;

  const seriesGcdIds = seriesBatch.map((s) => s.gcd_id);
  const seriesTitles = [
    ...new Set(seriesBatch.map((s) => s.title).filter(Boolean)),
  ];

  // The canonical_covers fetch below filters by exact series_title, but GCD and
  // ComicVine disagree on the leading article ("Flash" vs "The Flash"). normTitle
  // reconciles them in-memory — but only for covers we actually FETCHED. So
  // expand the fetch set with the article variant of each title (add "The X"
  // for "X", and "X" for "The X"), or the right covers never get pulled and the
  // in-memory keying has nothing to match. This is what was leaving 723 "The
  // Flash" covers stranded from the "Flash" series rows.
  const coverFetchTitles = [
    ...new Set(
      seriesTitles.flatMap((t) => {
        const variants = [t];
        if (/^the\s+/i.test(t)) variants.push(t.replace(/^the\s+/i, ""));
        else variants.push(`The ${t}`);
        return variants;
      })
    ),
  ];

  const issueRows = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const page = await runWithRetry("gcd_issues page", () =>
      supabase
        .from("gcd_issues")
        .select("series_gcd_id, publisher_gcd_id, issue_number, publication_date, key_date")
        .in("series_gcd_id", seriesGcdIds)
        .order("gcd_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
    );

    if (!page || page.length === 0) break;
    issueRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const publisherGcdIds = [
    ...new Set(
      (issueRows ?? [])
        .map((r) => r.publisher_gcd_id)
        .filter(Boolean)
        .map(String)
    ),
  ];

  const pubNameByGcdId = {};
  if (publisherGcdIds.length > 0) {
    const { data: pubRows, error: pubErr } = await supabase
      .from("gcd_publishers")
      .select("gcd_id, name")
      .in("gcd_id", publisherGcdIds);

    if (pubErr) throw pubErr;

    for (const row of pubRows ?? []) {
      pubNameByGcdId[String(row.gcd_id)] = row.name;
    }
  }

  const issuesBySeriesGcdId = new Map();
  for (const row of issueRows ?? []) {
    const key = String(row.series_gcd_id);
    if (!issuesBySeriesGcdId.has(key)) issuesBySeriesGcdId.set(key, []);
    issuesBySeriesGcdId.get(key).push(row);
  }

  // Fetch canonical_covers for all titles in this batch. We deliberately do NOT
  // filter on issue_number at SQL level — with 100 series × ~50 issues, the URL
  // grows past undici's ~16KB header cap and the request fails with
  // UND_ERR_HEADERS_OVERFLOW. The per-issue matching happens in JS below using
  // coversByTitleAndIssue, so the matching quality is identical.
  //
  // BUG FIX 2026-05-19: this query previously had no pagination. PostgREST
  // caps responses at 1000 rows by default. A 100-series batch easily exceeds
  // 1000 canonical_covers rows (e.g. "The Amazing Spider-Man" alone has 917),
  // so the request was silently truncated and the matcher saw only a partial
  // view of the data. Symptom: series with abundant covers in canonical_covers
  // (ASM 1999, Simpsons Comics, etc.) had featured_cover_path_cached=NULL
  // because the 1999-volume rows happened to be past row #1000 in the response.
  // Fix: paginate with .range() exactly the same way the gcd_issues fetch
  // pages elsewhere in this script.
  let coverRows = [];
  if (seriesTitles.length > 0) {
    const COVER_PAGE = 1000;
    let from = 0;
    while (true) {
      // runWithRetry returns `data` directly (NOT {data, error}); destructuring
      // it as {data, error} silently produced undefined and broke the loop on
      // its first iteration — which wiped every featured_cover_path_cached to
      // NULL because the matcher saw an empty cover pool for every series.
      const page = await runWithRetry(
        `canonical_covers page from=${from}`,
        () =>
          supabase
            .from("canonical_covers")
            .select("series_title, storage_path, publisher, cover_date, issue_number, series_year")
            .in("series_title", coverFetchTitles)
            .order("id", { ascending: true })
            .range(from, from + COVER_PAGE - 1)
      );

      if (!page || page.length === 0) break;
      coverRows.push(...page);
      if (page.length < COVER_PAGE) break;
      from += COVER_PAGE;
    }
  }

  // Index covers by (lowercased title, issue_number) so each series can pull
  // exactly the candidate covers that correspond to its own issue numbers.
  const coversByTitleKey = new Map();
  const coversByTitleAndIssue = new Map();
  for (const row of coverRows) {
    const titleKey = normTitle(row.series_title);
    if (!titleKey) continue;
    if (!coversByTitleKey.has(titleKey)) coversByTitleKey.set(titleKey, []);
    coversByTitleKey.get(titleKey).push(row);

    const issueKey = `${titleKey}::${String(row.issue_number ?? "").trim()}`;
    if (!coversByTitleAndIssue.has(issueKey)) coversByTitleAndIssue.set(issueKey, []);
    coversByTitleAndIssue.get(issueKey).push(row);
  }

  // Phase 1: compute per-series metadata (issueCount, years, resolvedPublisher).
  // Covers are NOT picked here because we need cross-volume assignment.
  const computed = seriesBatch.map((series) => {
    const issuesForSeries = issuesBySeriesGcdId.get(String(series.gcd_id)) ?? [];

    // Dedupe by BASE issue number — strips bracketed/spaced/slash suffixes
    // so `1`, `1 [Newsstand]`, `1 [Direct Edition]`, `1 [Variant Cover]`
    // all collapse to issue 1. Without this, Superman (2011) reads as 114
    // issues because each variant row has a distinct issue_number string.
    // The diagnostic at scripts/diagnoseIssuesData.js confirmed bracketed
    // variants are ~5% of rows and slash-year is ~16% (foreign convention).
    //
    // When multiple rows share a base number, prefer the row with the
    // earliest valid date (original printing beats reprints) AND prefer
    // dated rows over undated ones (don't drop year data we have).
    const issueByBase = new Map();
    for (const row of issuesForSeries) {
      if (isPlaceholderIssueNumber(row.issue_number)) continue;
      const base = baseIssueNumber(row.issue_number);
      if (!base) continue;
      const existing = issueByBase.get(base);
      if (!existing) {
        issueByBase.set(base, row);
        continue;
      }
      const existingYear = bestYearFor(existing);
      const candidateYear = bestYearFor(row);
      if (
        candidateYear != null &&
        (existingYear == null || candidateYear < existingYear)
      ) {
        issueByBase.set(base, row);
      }
    }
    const dedupedIssues = [...issueByBase.values()];

    const issueCount = dedupedIssues.length;

    // Year span uses the RAW row set, not the deduped one. Rationale: a
    // chunk of rows have a valid publication_date but a null/empty
    // issue_number — the dedupe drops them, which previously took 92k
    // series from "has a year" to "null year." The live series API also
    // computes years from raw rows, so this stays consistent with it.
    // Trade-off: reprints can push year_end past the run's actual finale
    // (TMNT 2011 → 2024 instead of 2020). That's preferable to losing
    // 92k series's year data outright.
    const years = issuesForSeries
      .map((r) => bestYearFor(r))
      .filter((y) => y != null);

    const yearStart = years.length ? Math.min(...years) : null;
    const yearEnd = years.length ? Math.max(...years) : null;

    const issuePublisherNames = [
      ...new Set(
        issuesForSeries
          .map((r) => r.publisher_gcd_id)
          .filter(Boolean)
          .map((id) => pubNameByGcdId[String(id)])
          .filter(Boolean)
      ),
    ];

    const titleKey = normTitle(series.title);

    // Per-issue cover matching: for each issue this series has, look up only
    // canonical_covers whose (series_title, issue_number) actually match.
    // Prefer covers whose series_year matches the issue's publication year.
    const seriesIssueNums = new Set(
      issuesForSeries.map((r) => String(r.issue_number ?? "").trim()).filter(Boolean)
    );

    const issueYearByNumber = new Map();
    for (const r of issuesForSeries) {
      const num = String(r.issue_number ?? "").trim();
      if (!num) continue;
      const y = bestYearFor(r);
      if (y != null) issueYearByNumber.set(num, y);
    }

    const coverCandidates = [];
    for (const num of seriesIssueNums) {
      const pool = coversByTitleAndIssue.get(`${titleKey}::${num}`) ?? [];
      if (pool.length === 0) continue;

      const issueYear = issueYearByNumber.get(num);
      const yearMatched = issueYear != null
        ? pool.filter((row) => Number(row.series_year) === issueYear)
        : [];

      // If we have a year-matched cover, that's almost certainly the right one.
      // Otherwise take all candidates for this issue and let the scorer sort it out.
      const chosenPool = yearMatched.length > 0 ? yearMatched : pool;
      for (const row of chosenPool) {
        coverCandidates.push({ ...row, _issueYear: issueYear ?? null });
      }
    }

    // The FULL set of covers that share this title, across every volume.
    // This is the pool the featured-cover scorer actually uses (see Phase 2).
    //
    // BUG FIX 2026-05-23: this used to be populated ONLY when per-issue
    // matching found nothing. But GCD and ComicVine number the same logical
    // series differently — GCD numbers each relaunch volume 1..N, while
    // ComicVine (canonical_covers) keeps legacy whole-series numbering
    // (Action Comics 2017 = #957+, Daredevil 2020 = #611+). So per-issue
    // string matching on "1".."22" matched the 1938 and 2011 #1 covers and
    // EXCLUDED the correct 2017-era covers (numbered 957+) from the candidate
    // pool. Phase 2 then never fell back to this full pool, and the year
    // scorer picked the least-wrong old cover. Always populate the full pool
    // and let Phase 2 score year-fit across all of it.
    const fallbackPool = coversByTitleKey.get(titleKey) ?? [];

    const canonicalPublisher =
      coverCandidates.find((r) => r.publisher)?.publisher
      ?? fallbackPool.find((r) => r.publisher)?.publisher
      ?? null;

    // Year-aware publisher resolution — must match the logic in
    // scripts/repairSeriesPublishersWithCv.js. Without this, every cache
    // refresh regresses the 1984 TMNT (and any other pre-2000 series whose
    // IP later changed hands) back to its modern owner. Rule:
    //   year_start >= 2000 or null → trust cv_publisher (ComicVine is
    //     reliable for modern attribution).
    //   year_start < 2000 → prefer GCD indicia (cv often points at the
    //     current IP holder, not the original publisher). Only fall back
    //     to cv if indicia gives nothing useful.
    const MODERN_ERA_CUTOFF = 2000;
    const candidates = [series.publisher?.name ?? null, ...issuePublisherNames];
    let resolvedPublisher;
    if (yearStart == null || yearStart >= MODERN_ERA_CUTOFF) {
      resolvedPublisher = resolvePublisher({
        cv: series.cv_publisher ?? canonicalPublisher,
        candidates,
        seriesTitle: series.title,
      });
    } else {
      const indiciaResolved = resolvePublisher({
        cv: null,
        candidates,
        seriesTitle: series.title,
      });
      if (indiciaResolved && indiciaResolved !== "Unknown Publisher") {
        resolvedPublisher = indiciaResolved;
      } else {
        // Indicia useless — fall back to cv. Better something than
        // "Unknown Publisher" for a row that's clearly attributable.
        resolvedPublisher = resolvePublisher({
          cv: series.cv_publisher ?? canonicalPublisher,
          candidates,
          seriesTitle: series.title,
        });
      }
    }

    // Curated override for the marketable core. Both raw publisher signals are
    // corrupt for the titles collectors search, so pinned values in
    // src/lib/seriesOverrides.js win over the computed ones. A non-US override
    // publisher (e.g. "Marvel UK") drops the row from US search via the
    // allowlist; hide:true forces exclusion via a null publisher.
    const override = getSeriesOverride(series.gcd_id);
    const finalPublisher = override?.hide
      ? null
      : (override?.publisher ?? resolvedPublisher);
    const finalYearStart = override?.year_start ?? yearStart;
    const finalYearEnd = override?.year_end ?? yearEnd;

    return {
      series,
      titleKey,
      issueCount,
      yearStart: finalYearStart,
      yearEnd: finalYearEnd,
      resolvedPublisher: finalPublisher,
      coverCandidates,
      fallbackPool,
    };
  });

  // Phase 2: assign covers per title group with no reuse across volumes.
  const byTitleGroup = new Map();
  for (const entry of computed) {
    if (!byTitleGroup.has(entry.titleKey)) byTitleGroup.set(entry.titleKey, []);
    byTitleGroup.get(entry.titleKey).push(entry);
  }

  const coverPathByEntry = new Map();

  for (const [, group] of byTitleGroup) {
    const chronological = [...group].sort((a, b) => {
      const ay = a.yearStart ?? Number.POSITIVE_INFINITY;
      const by = b.yearStart ?? Number.POSITIVE_INFINITY;
      if (ay !== by) return ay - by;
      return (b.issueCount ?? 0) - (a.issueCount ?? 0);
    });

    const claimed = new Set();

    for (const entry of chronological) {
      const { yearStart, yearEnd, resolvedPublisher, coverCandidates, fallbackPool } = entry;
      const normPub = normalizePublisherForMatch(resolvedPublisher);
      // Score year-fit across the FULL title pool, not the per-issue matches.
      // Per-issue matching is unreliable for the featured cover because GCD and
      // ComicVine number relaunch volumes differently (see Phase 1 comment), so
      // it both excludes correct covers and admits wrong-era ones. The full
      // pool + year scoring + the `claimed` no-reuse mechanism below correctly
      // separates a 1938 / 2011 / 2017 same-title set into their own volumes.
      const effectivePool = fallbackPool;

      const scoreCover = (row, { allowClaimed }) => {
        if (!row.storage_path) return -Infinity;
        if (!allowClaimed && claimed.has(row.storage_path)) return -Infinity;
        let score = 0;

        const coverYear = parseYear(row.cover_date);
        if (coverYear != null && yearStart != null && yearEnd != null) {
          if (coverYear >= yearStart && coverYear <= yearEnd) {
            score += 200;
            if (coverYear === yearStart) score += 40;
          } else {
            score -= Math.abs(coverYear - yearStart) * 10;
          }
        } else if (yearStart != null && coverYear == null) {
          score -= 500;
        }

        if (normPub && row.publisher) {
          if (normalizePublisherForMatch(row.publisher) === normPub) score += 60;
        }

        const issueStr = String(row.issue_number ?? "").trim();
        if (issueStr === "1" || issueStr === "#1") score += 50;

        return score;
      };

      const pickBest = ({ allowClaimed }) => {
        let best = null;
        let bestScore = -Infinity;
        for (const row of effectivePool) {
          const s = scoreCover(row, { allowClaimed });
          if (s > bestScore) {
            best = row;
            bestScore = s;
          }
        }
        return { row: best, score: bestScore };
      };

      // Quality threshold: only commit a cover if it actually fits this volume.
      // 200 = the year-in-range bonus, so this requires the cover_date to fall
      // within yearStart..yearEnd. Without this, cross-volume bleed happens —
      // a 2016 Batman cover ends up on the 1940 Batman row because there's no
      // disqualifying constraint, and the user clicks a 2016-looking tile and
      // lands on 1940 issues. Better to leave the cover null than mismatched.
      const COVER_SCORE_THRESHOLD = 200;

      let { row: bestCover, score: bestScore } = pickBest({ allowClaimed: false });
      if (!bestCover || bestScore < COVER_SCORE_THRESHOLD) {
        const reattempt = pickBest({ allowClaimed: true });
        if (reattempt.row && reattempt.score >= COVER_SCORE_THRESHOLD) {
          bestCover = reattempt.row;
          bestScore = reattempt.score;
        } else {
          bestCover = null;
        }
      }

      // Tier 3 fallback — when no cover clears the strict year-fit threshold,
      // accept any cover that shares the title. We prefer publisher match and
      // issue #1, but ignore year fit entirely. This is how we get coverage
      // from 0.7% to ~3.4% without ingesting new data: ~5,800 series have a
      // cover sitting in canonical_covers right now that the strict matcher
      // throws away (year window or null year disqualifies it). Better to
      // show a wrong-volume cover than a blank placeholder — search users
      // recognize the title from the cover, click through, and find the
      // right run on the series page (which uses its own per-issue match).
      if (!bestCover) {
        // Tier-3 fallback now ALSO enforces a year-distance ceiling. Without
        // it, the 2022 Spider-Man series gets stuck with a 1990 McFarlane
        // Spider-Man cover assigned to it (real bug, observed) — because that's
        // the only "Spider-Man" cover in canonical_covers and the strict
        // matcher correctly rejected it for year mismatch. The fallback then
        // accepted it anyway. Result: search tile shows a misleading 30-year-
        // wrong cover, user clicks in, per-issue page shows zero covers
        // (because /api/series/[id] does NOT have this fallback), and the
        // discontinuity makes the whole page look broken.
        //
        // Rule: when both the series and the candidate cover have a year, the
        // cover must be within FALLBACK_YEAR_TOLERANCE of yearStart. If either
        // side is missing year data, fall through to the old behavior since
        // we can't make a year judgment.
        const FALLBACK_YEAR_TOLERANCE = 10;
        let softBest = null;
        let softScore = -Infinity;
        for (const row of effectivePool) {
          if (!row.storage_path) continue;

          if (yearStart != null) {
            const coverYear =
              parseYear(row.cover_date) ??
              (row.series_year != null ? Number(row.series_year) : null);
            if (
              coverYear != null &&
              Math.abs(coverYear - yearStart) > FALLBACK_YEAR_TOLERANCE
            ) {
              continue; // wrong era — skip even at the loose fallback tier
            }
          }

          let s = 0;
          if (normPub && row.publisher && normalizePublisherForMatch(row.publisher) === normPub) {
            s += 60;
          }
          const issueStr = String(row.issue_number ?? "").trim();
          if (issueStr === "1" || issueStr === "#1") s += 50;
          // Prefer unclaimed even at this tier so we don't all point at the
          // same one cover for 50 different "Batman" volumes.
          if (claimed.has(row.storage_path)) s -= 200;
          if (s > softScore) {
            softBest = row;
            softScore = s;
          }
        }
        bestCover = softBest;
      }

      const path = bestCover?.storage_path ?? null;
      if (path) {
        claimed.add(path);
        coverPathByEntry.set(entry.series.id, path);
      }
    }
  }

  // Phase 3: write updates
  const now = new Date().toISOString();
  let updated = 0;

  for (const entry of computed) {
    const { series, issueCount, yearStart, yearEnd, resolvedPublisher } = entry;
    const featuredCoverPath = coverPathByEntry.get(series.id) ?? null;

    if (DRY_RUN) {
      console.log(
        `[dry-run] ${series.title} (${yearStart}-${yearEnd}) → ` +
          `featured=${featuredCoverPath ?? "NULL"} | pub=${resolvedPublisher} | issues=${issueCount}`
      );
      updated += 1;
      continue;
    }

    const { error: updErr } = await supabase
      .from("series")
      .update({
        issue_count_cached: issueCount,
        year_start_cached: yearStart,
        year_end_cached: yearEnd,
        resolved_publisher_cached: resolvedPublisher,
        featured_cover_path_cached: featuredCoverPath,
        search_refreshed_at: now,
      })
      .eq("id", series.id);

    if (updErr) {
      console.error(`Failed to update series ${series.id}:`, updErr);
      continue;
    }

    updated += 1;
  }

  return updated;
}

// Coverage report — reframed away from the catalog-wide
// featured_cover_path_cached % vanity metric (217k series, ~99% of which
// no user will ever look at, so the % is structurally pinned at single
// digits regardless of how much we ingest).
//
// New metrics tie to user-facing experience:
//   • Raw catalog volume (covers + distinct titles) — proves ingest is
//     working.
//   • Featured-series coverage — out of curated homepage titles, what's
//     missing? Directly visible.
//   • Series-that-users-actually-collect coverage — among series someone
//     has added to a user_collections row, what % have a cover? This is
//     the only "% of series" that actually matters.
async function reportCoverage() {
  const { count: totalSeries } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null);

  const { count: unrefreshed } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null)
    .is("search_refreshed_at", null);

  const { count: nullStart } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null)
    .is("year_start_cached", null);

  const { count: coverRows } = await supabase
    .from("canonical_covers")
    .select("id", { count: "exact", head: true })
    .not("storage_path", "is", null);

  // Distinct series_title values in canonical_covers — the real "how many
  // series do we have ANY cover for" number. Paginated to dodge the 1000-
  // row PostgREST cap.
  const distinctCoverTitles = new Set();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from("canonical_covers")
      .select("series_title")
      .not("storage_path", "is", null)
      .range(from, from + PAGE - 1);
    if (!data?.length) break;
    for (const r of data) distinctCoverTitles.add(r.series_title);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Coverage among series users actually collect. We pull distinct
  // gcd_issue_id from user_collections, map back to series, and check
  // featured_cover_path_cached. This is the % that matters.
  const userGcdIds = new Set();
  from = 0;
  while (true) {
    const { data } = await supabase
      .from("user_collections")
      .select("gcd_issue_id")
      .not("gcd_issue_id", "is", null)
      .range(from, from + PAGE - 1);
    if (!data?.length) break;
    for (const r of data) userGcdIds.add(Number(r.gcd_issue_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  let collectedSeriesGcdIds = new Set();
  if (userGcdIds.size > 0) {
    const ids = [...userGcdIds];
    for (let i = 0; i < ids.length; i += PAGE) {
      const chunk = ids.slice(i, i + PAGE);
      const { data } = await supabase
        .from("gcd_issues")
        .select("series_gcd_id")
        .in("gcd_id", chunk);
      for (const r of data ?? []) {
        if (r.series_gcd_id != null) collectedSeriesGcdIds.add(r.series_gcd_id);
      }
    }
  }

  let collectedWithCover = 0;
  if (collectedSeriesGcdIds.size > 0) {
    const ids = [...collectedSeriesGcdIds];
    for (let i = 0; i < ids.length; i += PAGE) {
      const chunk = ids.slice(i, i + PAGE);
      const { data } = await supabase
        .from("series")
        .select("gcd_id, featured_cover_path_cached")
        .in("gcd_id", chunk)
        .not("featured_cover_path_cached", "is", null);
      collectedWithCover += data?.length ?? 0;
    }
  }
  const collectedPct = collectedSeriesGcdIds.size > 0
    ? ((collectedWithCover / collectedSeriesGcdIds.size) * 100).toFixed(1)
    : "—";

  console.log("──────── Cache state ────────");
  console.log(`Total series in catalog: ${totalSeries ?? 0}`);
  console.log(`Year-cached:             ${(totalSeries ?? 0) - (nullStart ?? 0)} / ${totalSeries ?? 0}`);
  console.log(`Awaiting refresh:        ${unrefreshed ?? 0}`);
  console.log();
  console.log("──────── Cover state (volume) ────────");
  console.log(`canonical_covers rows:   ${coverRows ?? 0}`);
  console.log(`Distinct cover'd series: ${distinctCoverTitles.size}`);
  console.log();
  console.log("──────── Coverage where it matters ────────");
  console.log(`Series users have collected:           ${collectedSeriesGcdIds.size}`);
  console.log(`  …of which have featured_cover_path:  ${collectedWithCover} (${collectedPct}%)`);
  console.log("──────────────────────────────────────────");
}

async function run() {
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (FORCE) console.log("Mode: --force (ignoring search_refreshed_at, walking by id cursor)");

  let total = 0;
  let batchesRun = 0;

  while (true) {
    if (batchesRun >= MAX_BATCHES) {
      console.log(`Reached --max-batches=${MAX_BATCHES}. Stopping (cursor preserved).`);
      break;
    }

    const batch = await fetchSeriesBatch();
    if (batch.length === 0) break;

    const count = await processBatch(batch);
    total += count;
    batchesRun += 1;
    console.log(`Processed ${count} (total ${total})`);

    if (count === 0) {
      console.error("Batch returned 0 updates — stopping to avoid infinite loop.");
      break;
    }

    // --only-ids is a one-shot targeted refresh: process the named rows once
    // and stop (re-fetching would just return the same rows and loop forever).
    if (ONLY_IDS) break;
  }

  console.log("DONE. Total updated:", total);

  // Clean run — drop the resume cursor so the next --force starts fresh.
  if (FORCE) clearCursor();

  await reportCoverage();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
