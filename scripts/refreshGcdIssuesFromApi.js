// Updated 2026-11-01: unmatched recent covers run first, and every fetched
// issue records its variant relationship plus exact live issue details.
// X-Men (2024) was missing #40 and two variants while its release-day cover
// waited unattached; post-dump inserts also left 2,590 base ids null.
// Targeted top-up of gcd_issues from GCD's own live API - NOT a fresh bulk
// dump. Our gcd_issues mirror was populated once from an old GCD Postgres
// dump and never refreshed, so ongoing series silently fall behind (e.g.
// Absolute Superman: our mirror had issues 1-10, GCD's live data already had
// all 22). This fills the gap per-series instead of re-importing everything.
//
// Confirmed 2026-08-10: comics.org/api/series/<gcd_id>/ and
// comics.org/api/issue/<gcd_id>/ are public JSON endpoints, unauthenticated,
// NOT behind the Cloudflare wall that blocks files1.comics.org (cover
// images) - that wall is specific to the image host, not the REST API.
// Rate limits are undocumented (GCD is small, volunteer-run) so this
// self-throttles deliberately - don't remove the sleep.
//
// Usage:
//   node scripts/refreshGcdIssuesFromApi.js --gcd-ids=217177,120640
//   node scripts/refreshGcdIssuesFromApi.js --source=active [--max-series=300]
//   node scripts/refreshGcdIssuesFromApi.js --source=active --list-only
//   node scripts/refreshGcdIssuesFromApi.js --source=featured [--max-series=20]
//   node scripts/refreshGcdIssuesFromApi.js --gcd-ids=217177 --dry-run
//   node scripts/refreshGcdIssuesFromApi.js --source=featured --no-cursor

import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

import { describeError } from "./lib/describeError.js";
import { orderActiveTargets, pickBestCandidate, readCursor, rotate, writeCursor } from "./lib/featuredTargets.js";
import { fetchRecentComicVineIssues } from "./lib/cvRecentReleases.js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";
import { catalogBarcodeRow, insertCatalogBarcode } from "./lib/gcdBarcodes.js";
import { issueIdFromUrl, issueRowsFromJson, unmatchedCoverSeries, variantFieldsFromSeriesJson } from "./lib/gcdIssueRefresh.js";
import { issueNumberOrFilter } from "../src/lib/csvImport/matchRow.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const DRY_RUN = Boolean(args["dry-run"]);
const LIST_ONLY = Boolean(args["list-only"]);
const REPAIR_VARIANTS = Boolean(args["repair-variants"]);
const USE_CURSOR = !args["no-cursor"];
// 700ms tripped a 429 (Retry-After ~52min) well under 100 requests in
// testing on 2026-08-10. 2000ms is a more conservative starting point, not
// a confirmed-safe number - GCD's actual sustained rate limit is
// undocumented. Re-tune once real usage data exists.
//
// Measured 2026-09-23 from the live 09-16 run: 29 requests spread over 76s at
// this 2000ms spacing still tripped a 429 with Retry-After 3525s (~59 min).
// So the limit behaves like a fixed budget per hour rather than a rate -
// spacing requests further apart buys nothing, and the only thing that helps
// is spending each run's budget on different series. See ROTATION below.
const SLEEP_MS = Number(args.sleep ?? 2000);
// At two seconds per GCD request, 300 check-only series take about 10 minutes.
// That leaves about 50 minutes of the workflow's 60-minute timeout for issue
// fetches and database work if GCD ever stops enforcing its current ~30/hour
// budget. --limit remains as a backwards-compatible alias.
const maxSeriesArg = args["max-series"] ?? args.limit ?? 300;
const MAX_SERIES = Number(maxSeriesArg);
if (!Number.isInteger(MAX_SERIES) || MAX_SERIES < 0) {
  throw new Error(`--max-series must be a non-negative integer, got ${maxSeriesArg}`);
}
const maxIssuesArg = args["max-issues"] ?? Infinity;
const MAX_ISSUES = Number(maxIssuesArg);
if (MAX_ISSUES < 0 || Number.isNaN(MAX_ISSUES)) {
  throw new Error(`--max-issues must be non-negative, got ${maxIssuesArg}`);
}

const UA = { "User-Agent": "Mozilla/5.0 (ComixCatalog gcd-issue-refresh; contact via repo)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ROTATION
//
// A run gets roughly 29 GCD requests before the 429, and the featured list is
// 78 series, so one run can never reach the end of the list. The order used to
// be fixed, which meant every weekly run re-walked the same front of the list
// and the tail was never refreshed at all. This cursor records the last series
// a run attempted; the next run starts after it and wraps, so the whole list
// gets covered across several runs instead of never.
const CURSOR_FILE = path.resolve(__dirname, "../gcd-refresh-cursor.json");

// GCD's rate limit is real and fairly tight (confirmed 2026-08-10: tripped
// after well under 100 requests in a short window, returning 429 with a
// Retry-After that can be tens of minutes). On 429, respect Retry-After
// exactly and stop the whole run rather than retry-and-burn-more-budget -
// a script that silently keeps hammering a volunteer-run nonprofit's API
// after being told to back off is not something to ship.
class RateLimited extends Error {
  constructor(retryAfterSeconds) {
    super(`GCD rate-limited us. Retry-After: ${retryAfterSeconds}s (~${Math.ceil(retryAfterSeconds / 60)} min). Stopping run.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function fetchJson(url, tries = 2) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 60);
      throw new RateLimited(retryAfter);
    }
    if (res.status >= 500 && attempt < tries) {
      await sleep(SLEEP_MS * 2 * attempt);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  throw new Error(`Failed after ${tries} attempts: ${url}`);
}

// PostgREST caps a read at 1000 rows and gives no indication that it
// truncated, which is the most repeated bug in this repo. Measured live
// 2026-09-23: this filter matches 1,426 rows and the unpaginated version
// returned exactly 1,000, so 426 candidates never reached the picker. The
// damage was not subtle - 9 of the 79 featured entries had every candidate
// truncated away and were skipped in silence (all five Absolute titles among
// them, including Absolute Superman, the series this script was written for),
// and another 20 resolved to a different series than the complete set gives.
//
// Using the shared fetchAllPages rather than another private loop is the
// point: OPERATIONS_HANDOFF 2a records eleven separate local copies of this
// walk, and names that duplication as the reason the bug keeps coming back.
// A twelfth copy here would have been the bug reproducing itself.
async function allFeaturedSeriesRows(titles) {
  try {
    return await fetchAllPages(() =>
      supabase
        .from("series")
        .select("id, gcd_id, title, resolved_publisher_cached, year_start_cached")
        .in("title", titles)
        .not("gcd_id", "is", null)
    );
  } catch (err) {
    // fetchAllPages rethrows the bare PostgREST object, which prints as
    // "[object Object]" and names neither the query nor the code.
    throw new Error(`featured series lookup: ${describeError(err)}`);
  }
}

function chunks(values, size = 300) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function getFeaturedGcdIds() {
  const { FEATURED_SERIES } = await import("../src/lib/featuredSeries.js");
  const titles = [...new Set(FEATURED_SERIES.map((e) => e.title))];
  const rows = await allFeaturedSeriesRows(titles);

  const pool = new Map();
  for (const r of rows) {
    const key = `${r.title.toLowerCase()}::${(r.resolved_publisher_cached ?? "").toLowerCase()}`;
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(r);
  }

  const ids = [];
  const unmatched = [];
  for (const entry of FEATURED_SERIES) {
    const key = `${entry.title.toLowerCase()}::${entry.publisher.toLowerCase()}`;
    const best = pickBestCandidate(entry, pool.get(key));
    if (!best) {
      unmatched.push(`${entry.title} (${entry.publisher})`);
      continue;
    }
    ids.push(Number(best.gcd_id));
  }

  const unique = [...new Set(ids)];
  console.log(`Featured source: ${FEATURED_SERIES.length} entries | ${rows.length} candidate rows | ${unique.length} distinct GCD series.`);
  if (unmatched.length) {
    console.log(`  ${unmatched.length} featured entries have no series row matching title+publisher:`);
    for (const u of unmatched) console.log(`    - ${u}`);
  }
  return unique;
}

async function getOwnedGcdIds() {
  const collectionRows = await fetchAllPages(() =>
    supabase.from("user_collections").select("id, gcd_issue_id").not("gcd_issue_id", "is", null),
  "id");
  const issueIds = [...new Set(collectionRows.map((row) => Number(row.gcd_issue_id)).filter(Boolean))];
  const seriesIds = new Set();
  for (const chunk of chunks(issueIds)) {
    const rows = await fetchAllPages(() =>
      supabase.from("gcd_issues").select("gcd_id, series_gcd_id").in("gcd_id", chunk),
    "gcd_id");
    for (const row of rows) if (row.series_gcd_id) seriesIds.add(Number(row.series_gcd_id));
  }
  const ids = [...seriesIds].sort((a, b) => a - b);
  console.log(`Owned source: ${collectionRows.length} collection rows | ${issueIds.length} distinct issues | ${ids.length} distinct GCD series.`);
  return ids;
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function getRecentGcdIds() {
  const issues = await fetchRecentComicVineIssues({
    apiKey: process.env.COMICVINE_API_KEY,
    sinceDate: isoDaysAgo(30),
  });
  const volumeIds = [...new Set(issues.map((issue) => Number(issue.volume?.id)).filter(Boolean))];
  const seriesIds = new Set();
  let mappedRows = 0;
  for (const chunk of chunks(volumeIds)) {
    const rows = await fetchAllPages(() =>
      supabase
        .from("series")
        .select("id, gcd_id, comicvine_volume_id")
        .in("comicvine_volume_id", chunk)
        .not("gcd_id", "is", null),
    "id");
    mappedRows += rows.length;
    for (const row of rows) seriesIds.add(Number(row.gcd_id));
  }
  const ids = [...seriesIds].filter(Boolean).sort((a, b) => a - b);
  console.log(`Recent source (30 days): ${issues.length} ComicVine issues | ${volumeIds.length} volumes | ${mappedRows} mapped series rows | ${ids.length} distinct GCD series.`);
  return ids;
}

// Series the unmatched source checked recently. A cover whose number GCD
// will never carry (or hasn't indexed yet) would otherwise cost a series
// request on every run and starve real new issues of GCD's ~30-request
// budget, so a series is rechecked only after UNMATCHED_RECHECK_MS.
const UNMATCHED_FILE = path.resolve(__dirname, "../gcd-unmatched-checked.json");
const UNMATCHED_RECHECK_MS = 12 * 60 * 60 * 1000;
function readUnmatchedChecked() {
  try { return JSON.parse(fs.readFileSync(UNMATCHED_FILE, "utf8")); } catch { return {}; }
}
function writeUnmatchedChecked(checked) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const kept = Object.fromEntries(Object.entries(checked).filter(([, at]) => Date.parse(at) > cutoff).sort(([a], [b]) => Number(a) - Number(b)));
  fs.writeFileSync(UNMATCHED_FILE, `${JSON.stringify(kept, null, 2)}\n`);
}

async function getUnmatchedGcdIds(checked) {
  const covers = await fetchAllPages(() => supabase.from("canonical_covers")
    .select("id, series_gcd_id, issue_number, in_store_date, series_title")
    .gte("in_store_date", isoDaysAgo(30)).not("series_gcd_id", "is", null)
    .order("in_store_date", { ascending: false }).order("id", { ascending: false }), "id");
  // Only the issue numbers the covers carry are fetched (legacy "40 (340)"
  // forms included), never whole issue lists: long runs made this minutes.
  const numbersBySeries = new Map();
  for (const cover of covers) {
    const id = Number(cover.series_gcd_id);
    if (!numbersBySeries.has(id)) numbersBySeries.set(id, new Set());
    if (cover.issue_number) numbersBySeries.get(id).add(String(cover.issue_number).trim());
  }
  const issuesBySeries = new Map();
  for (const chunk of chunks([...numbersBySeries.keys()], 50)) {
    const numbers = [...new Set(chunk.flatMap((id) => [...numbersBySeries.get(id)]))];
    for (let at = 0; at < numbers.length; at += 25) {
      const filter = issueNumberOrFilter(numbers.slice(at, at + 25));
      if (!filter) continue;
      const rows = await fetchAllPages(() => supabase.from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, variant_of_gcd_id")
        .in("series_gcd_id", chunk).or(filter).order("gcd_id"), "gcd_id");
      for (const row of rows) {
        const id = Number(row.series_gcd_id);
        if (!issuesBySeries.has(id)) issuesBySeries.set(id, []);
        issuesBySeries.get(id).push(row);
      }
    }
  }
  const result = unmatchedCoverSeries(covers, issuesBySeries);
  console.log(`  e.g. ${result.covers.slice(0, 12).map((c) => `${c.series_title} #${c.issue_number} (${c.series_gcd_id})`).join(" | ")}`);
  const due = result.seriesIds.filter((id) => !(checked[id] && Date.now() - Date.parse(checked[id]) < UNMATCHED_RECHECK_MS));
  console.log(`Unmatched source (30 days): ${result.covers.length} covers | ${result.seriesIds.length} distinct GCD series | ${due.length} due (others checked in the last 12h).`);
  return due;
}

async function getTargetGcdIds() {
  if (args["gcd-ids"]) {
    return String(args["gcd-ids"]).split(",").map((s) => Number(s.trim())).filter(Boolean);
  }
  const source = args.source ?? "active";
  if (source === "featured") return getFeaturedGcdIds();
  if (source === "active") {
    const recent = await getRecentGcdIds();
    const owned = await getOwnedGcdIds();
    const featured = await getFeaturedGcdIds();
    const ids = orderActiveTargets({ recent, owned, featured });
    console.log(`Active union: ${ids.length} distinct GCD series (ordered recent, owned, featured).`);
    return ids;
  }
  throw new Error("Provide --gcd-ids=1,2,3, --source=active, or --source=featured");
}

async function loadKnownBaseChain(parentId) {
  const known = new Map();
  let current = parentId;
  while (current && !known.has(current)) {
    const { data: row, error } = await supabase.from("gcd_issues")
      .select("gcd_id, base_gcd_issue_id, variant_of_gcd_id").eq("gcd_id", current).maybeSingle();
    if (error) throw error;
    if (!row) break;
    known.set(Number(row.gcd_id), row);
    if (row.base_gcd_issue_id || !row.variant_of_gcd_id) break;
    current = Number(row.variant_of_gcd_id);
  }
  return known;
}

async function refreshOne(seriesGcdId) {
  const seriesJson = await fetchJson(`https://www.comics.org/api/series/${seriesGcdId}/?format=json`);
  await sleep(SLEEP_MS);

  const remoteIds = (seriesJson.active_issues ?? []).map(issueIdFromUrl).filter(Boolean);
  const remoteSet = new Set(remoteIds);

  const localRows = await fetchAllPages(() =>
    supabase.from("gcd_issues").select("gcd_id").eq("series_gcd_id", seriesGcdId),
  "gcd_id");
  const localSet = new Set((localRows ?? []).map((r) => Number(r.gcd_id)));

  const missing = remoteIds.filter((id) => !localSet.has(id)).sort((a, b) => a - b);

  console.log(`\n=== ${seriesJson.name} (gcd_id ${seriesGcdId}) ===`);
  console.log(`  GCD live: ${remoteSet.size} issue rows | local: ${localSet.size} | missing: ${missing.length}`);

  if (missing.length === 0 || DRY_RUN) {
    if (DRY_RUN && missing.length > 0) console.log(`  [dry-run] would fetch+insert ${missing.length} rows`);
    return { series: seriesJson.name, gcdId: seriesGcdId, missing: missing.length, inserted: 0 };
  }

  // Upsert incrementally (one row at a time, right after each fetch) rather
  // than batching the whole series to the end - if GCD rate-limits us
  // partway through a big series, whatever was already fetched is saved
  // instead of thrown away. Rows are safe/idempotent to upsert again later.
  let inserted = 0;
  let rateLimitedErr = null;
  const issuesToFetch = missing.slice(0, MAX_ISSUES);
  if (issuesToFetch.length < missing.length) {
    console.log(`  Limiting this invocation to ${issuesToFetch.length} missing issue fetches.`);
  }
  for (const issueId of issuesToFetch) {
    let issueJson;
    try {
      issueJson = await fetchJson(`https://www.comics.org/api/issue/${issueId}/?format=json`);
    } catch (err) {
      if (err instanceof RateLimited) { rateLimitedErr = err; break; }
      console.error(`    skipping issue ${issueId}: ${describeError(err)}`);
      continue;
    }
    await sleep(SLEEP_MS);

    const parentId = issueIdFromUrl(issueJson.variant_of);
    let known;
    try { known = parentId ? await loadKnownBaseChain(parentId) : new Map(); }
    catch (error) { console.error(`    base lookup failed for issue ${issueId}: ${describeError(error)}`); continue; }
    const rows = issueRowsFromJson(issueId, seriesGcdId, issueJson, known);
    const { error: upsertErr } = await supabase.from("gcd_issues").upsert(rows.issue, { onConflict: "gcd_id" });
    if (upsertErr) { console.error(`    upsert failed for issue ${issueId}: ${describeError(upsertErr)}`); continue; }
    const { error: detailsError } = await supabase.from("gcd_issue_details").upsert(rows.details, { onConflict: "gcd_issue_id" });
    if (detailsError) { console.error(`    details upsert failed for issue ${issueId}: ${describeError(detailsError)}`); continue; }
    const barcodeRow = catalogBarcodeRow(issueId, issueJson.barcode);
    if (barcodeRow) {
      try {
        await insertCatalogBarcode(supabase, barcodeRow);
      } catch (err) {
        console.error(`    barcode upsert failed for issue ${issueId}: ${describeError(err)}`);
      }
    }
    inserted++;
  }

  console.log(`  Inserted ${inserted} / ${missing.length} new issue rows.`);
  if (rateLimitedErr) throw rateLimitedErr;
  // Complete only when every missing issue was fetched; a series cut short by
  // the per-invocation issue cap is resumed next run, not skipped.
  return { series: seriesJson.name, gcdId: seriesGcdId, missing: missing.length, inserted, complete: issuesToFetch.length === missing.length };
}

async function repairVariants() {
  const rows = await fetchAllPages(() => supabase.from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number, base_gcd_issue_id")
    .is("base_gcd_issue_id", null).order("gcd_id", { ascending: false }), "gcd_id");
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.series_gcd_id}::${row.issue_number}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  rows.sort((a, b) => {
    const aDup = counts.get(`${a.series_gcd_id}::${a.issue_number}`) > 1 ? 1 : 0;
    const bDup = counts.get(`${b.series_gcd_id}::${b.issue_number}`) > 1 ? 1 : 0;
    return bDup - aDup || Number(b.gcd_id) - Number(a.gcd_id);
  });
  // One series request repairs every broken row in that series: GCD's
  // issue_descriptors mark variants ("40 (340) [Pere Pérez Cover]"), so the
  // 2,587 rows left on 2026-11-01 cost ~633 requests instead of 2,587. A row
  // the descriptors can't place (no same-number base) falls back to its own
  // issue request. --max-series caps series per run (default 15).
  const seriesOrder = [...new Set(rows.map((row) => Number(row.series_gcd_id)))];
  const maxSeries = Number(args["max-series"] ?? 15);
  const selectedSeries = seriesOrder.slice(0, maxSeries);
  console.log(`Repair variants: ${rows.length} unrepaired rows in ${seriesOrder.length} series; processing ${selectedSeries.length} series, duplicate-number series first.`);
  let repaired = 0;
  for (const seriesId of selectedSeries) {
    const seriesRows = rows.filter((row) => Number(row.series_gcd_id) === seriesId);
    const seriesJson = await fetchJson(`https://www.comics.org/api/series/${seriesId}/?format=json`);
    await sleep(SLEEP_MS);
    const fields = variantFieldsFromSeriesJson(seriesJson);
    for (const row of seriesRows) {
      try {
        let update = fields.get(Number(row.gcd_id));
        if (!update) {
          const json = await fetchJson(`https://www.comics.org/api/issue/${row.gcd_id}/?format=json`);
          await sleep(SLEEP_MS);
          const parentId = issueIdFromUrl(json.variant_of);
          const known = parentId ? await loadKnownBaseChain(parentId) : new Map();
          const projected = issueRowsFromJson(row.gcd_id, row.series_gcd_id, json, known);
          const { error: detailError } = await supabase.from("gcd_issue_details").upsert(projected.details, { onConflict: "gcd_issue_id" });
          if (detailError) throw detailError;
          update = projected.issue;
        }
        const { error: issueError } = await supabase.from("gcd_issues").update({
          variant_of_gcd_id: update.variant_of_gcd_id,
          variant_name: update.variant_name,
          base_gcd_issue_id: update.base_gcd_issue_id,
        }).eq("gcd_id", row.gcd_id);
        if (issueError) throw issueError;
        repaired++;
      } catch (error) {
        if (error instanceof RateLimited) throw error;
        console.error(`  repair failed for issue ${row.gcd_id}: ${describeError(error)}`);
      }
    }
  }
  console.log(`Repair complete: ${repaired} rows updated across ${selectedSeries.length} series.`);
}

// series.issue_count_cached only moved when weekly-refresh rotated around to
// the row, up to three weeks later, and the search RPC hides series whose
// count is 0. Iron Man (2026) had 10 issues and a count of 0 on 2026-10-24.
// Recompute the cache for every series this run added issues to.
async function refreshSeriesCache(seriesGcdIds) {
  const { data, error } = await supabase.from("series").select("id").in("gcd_id", seriesGcdIds);
  if (error) {
    console.error(`::warning::Series cache refresh skipped: ${describeError(error)}`);
    return;
  }
  const ids = (data ?? []).map((row) => row.id);
  if (!ids.length) return;
  console.log(`
Refreshing cached counts for ${ids.length} series that gained issues.`);
  // --skip-reconcile: the duplicate-cover pass scans every series with a
  // featured cover; the weekly full refresh runs it.
  const res = spawnSync(
    process.execPath,
    ["scripts/refreshSeriesSearchCache.js", "--force", "--skip-reconcile", `--only-ids=${ids.join(",")}`],
    { stdio: "inherit" },
  );
  if (res.status !== 0) console.error(`::warning::Series cache refresh exited ${res.status}; weekly-refresh will catch these up.`);
}

async function run() {
  if (REPAIR_VARIANTS) {
    try { await repairVariants(); } catch (error) {
      if (error instanceof RateLimited) { console.error(error.message); process.exitCode = 3; return; }
      throw error;
    }
    return;
  }
  const all = await getTargetGcdIds();
  if (LIST_ONLY) {
    if (args["contains"] != null) {
      const containsId = Number(args["contains"]);
      console.log(`Membership gcd_id ${containsId}: ${all.includes(containsId) ? "present" : "absent"}.`);
    }
    console.log(`Target gcd_ids (${all.length}): ${all.join(",")}`);
    return;
  }
  const rotating = USE_CURSOR && !args["gcd-ids"];
  const cursor = rotating ? readCursor(CURSOR_FILE, fs) : null;
  const ordered = rotating ? rotate(all, cursor) : all;
  const unmatchedChecked = readUnmatchedChecked();
  const unmatched = args.source === "active" && !args["gcd-ids"] ? await getUnmatchedGcdIds(unmatchedChecked) : [];
  const ids = [...unmatched, ...ordered.filter((id) => !unmatched.includes(id))].slice(0, MAX_SERIES);

  if (rotating) {
    if (cursor == null) {
      console.log("No cursor yet - starting at the top of the target list.");
    } else if (!all.includes(cursor)) {
      console.log(`Cursor gcd_id ${cursor} is no longer in the target list - starting at the top.`);
    } else {
      console.log(`Resuming after gcd_id ${cursor} - this run starts at ${ids[0]} and wraps.`);
    }
  }
  console.log(`Refreshing ${ids.length} series from GCD's live API${DRY_RUN ? " (dry-run)" : ""}...`);

  const results = [];
  // The cursor only moves past a series once all of its missing issues are
  // in. It used to record the last series attempted, so a run that hit GCD's
  // ~29-request budget partway through a series skipped the rest of it until
  // the rotation came all the way back around (Absolute Batman stuck at #14
  // while #15 to #24 existed, found 2026-10-18).
  let lastCompleted = null;
  let rateLimited = false;
  for (const id of ids) {
    try {
      const result = await refreshOne(id);
      results.push(result);
      if (result?.complete === false) {
        console.log(`  Series ${id} not finished this run; the next run resumes it.`);
        break;
      }
      if (unmatched.includes(id)) unmatchedChecked[id] = new Date().toISOString();
      else lastCompleted = id;
    } catch (err) {
      if (err instanceof RateLimited) {
        rateLimited = true;
        console.error(`\n${err.message}`);
        console.error("Stopping the whole run here - re-run later, already-inserted rows are safe (upsert is idempotent).");
        break;
      }
      // Any other failure (deleted series, bad payload) must not pin the
      // rotation to this series forever: log it and move on.
      console.error(`  ERROR on gcd_id ${id}: ${describeError(err)}`);
      lastCompleted = id;
    }
  }

  if (unmatched.length && !DRY_RUN) writeUnmatchedChecked(unmatchedChecked);

  // Resume after the last finished series, so a series cut short by a 429 or
  // --max-issues is picked up first next run. A dry run must not move it.
  if (rotating && !DRY_RUN && lastCompleted != null) {
    writeCursor(CURSOR_FILE, fs, lastCompleted);
    console.log(`\nCursor written: next run starts after gcd_id ${lastCompleted}.`);
  } else if (rotating && !DRY_RUN) {
    console.log("\nCursor unchanged: this run's first series isn't finished yet.");
  }

  const gained = results.filter((r) => r.inserted > 0).map((r) => r.gcdId);
  if (gained.length && !DRY_RUN) await refreshSeriesCache(gained);

  const totalMissing = results.reduce((s, r) => s + r.missing, 0);
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  console.log(`\nDone. ${results.length} of ${ids.length} series checked, ${totalMissing} issues were missing, ${totalInserted} inserted.`);

  // Exit 3 = "GCD told us to back off", which is expected and not a failure.
  // The workflow translates only this code to success, so every other
  // non-zero exit stays red. The whole step used to be wrapped in
  // `continue-on-error: true` and so could not fail at all - four consecutive
  // green runs turned out to be four truncated runs.
  if (rateLimited) process.exitCode = 3;
}

run().catch((err) => {
  console.error(describeError(err));
  process.exit(1);
});
