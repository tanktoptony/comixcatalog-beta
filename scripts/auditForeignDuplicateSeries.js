// Audit (read-only) for the "foreign duplicate" cleanup: gcd_series entries
// that share an exact title with a series already resolved to a real,
// recognized publisher (US_PUBLISHER_ALLOWLIST) but themselves resolve to
// something else — foreign-language reprints, licensed editions, book-club
// editions, etc. This is the actual mechanism behind every cover-mislinking
// bug fixed 2026-08-25 (Excalibur, Batman, Catwoman, and 160+ more volumes,
// 10,800+ covers relinked across three repair passes).
//
// Deliberately NOT "everything outside the allowlist" (170,425 series,
// 78% of the catalog) — the vast majority of those are legitimate content
// simply not yet publisher-classified, not foreign duplicates. Only series
// that duplicate a title we ALREADY carry correctly are candidates here;
// nothing unique is at risk of being identified as deletable.
//
// This script only REPORTS. It does not delete anything. For each
// candidate series it checks the three things that would make deletion
// unsafe:
//   1. Does any user_collections row reference one of its issues? (real
//      collector data — must never disappear out from under someone)
//   2. Does any `comics` row (manual/local entries) reference it via
//      series_id?
//   3. Does canonical_covers still have covers tagged to this gcd_id? (if
//      so, those covers need to be relinked to the correct allowlisted
//      gcd_id first, via repairAllCoverSeriesLinks.js's overlap scoring —
//      not blindly discarded)
//
// Usage: node scripts/auditForeignDuplicateSeries.js

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PAGE = 1000;

// Statement timeouts (57014) happen occasionally on this table given how
// many chunked queries this script fires — same transient-error class
// refreshSeriesSearchCache.js already retries around. Without this, one
// slow chunk out of ~40 kills the whole run.
const TRANSIENT_CODES = new Set(["57014", "53300", "PGRST116", "ETIMEDOUT"]);
async function runWithRetry(thunk, maxAttempts = 4) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await thunk();
    if (!error) return data;
    const isTransient = TRANSIENT_CODES.has(error.code || "") || /fetch failed/i.test(error.message || "");
    if (!isTransient || attempt === maxAttempts) throw error;
    const delayMs = [1000, 3000, 8000][attempt - 1] ?? 8000;
    console.log(`  transient error (${error.code || error.message}), retrying in ${delayMs}ms...`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

async function fetchAllPages(build, orderCol) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const data = await runWithRetry(() => build().order(orderCol).range(from, from + PAGE - 1));
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// Supabase/PostgREST .in() filters serialize the whole array into the query
// string — thousands of ids in one call risks exceeding URL length limits
// (this script crashed on the full 10,214-id set with an empty error
// before this was added). Chunk + fan out instead, matching the pattern
// already used in repairAllCoverSeriesLinks.js.
const CHUNK = 300;
async function fetchChunked(ids, build, orderCol) {
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    rows.push(...(await fetchAllPages(() => build(chunk), orderCol)));
  }
  return rows;
}

async function run() {
  console.log("Loading all series rows...");
  const allSeries = await fetchAllPages(
    () => supabase.from("series").select("id, gcd_id, title, resolved_publisher_cached").not("gcd_id", "is", null),
    "gcd_id"
  );
  console.log(`Total series: ${allSeries.length}`);

  const allowlistSet = new Set(US_PUBLISHER_ALLOWLIST);
  const allowlistedTitles = new Set();
  for (const r of allSeries) {
    if (allowlistSet.has(r.resolved_publisher_cached)) allowlistedTitles.add(r.title);
  }

  const candidates = allSeries.filter(
    (r) => !allowlistSet.has(r.resolved_publisher_cached) && allowlistedTitles.has(r.title)
  );
  console.log(`Candidate foreign-duplicate series: ${candidates.length}`);

  const candidateGcdIds = candidates.map((c) => c.gcd_id);
  const candidateSeriesIds = candidates.map((c) => c.id);

  console.log("\nChecking dependencies (this determines what's safe to delete)...");

  // 1. gcd_issues under these series — needed to check user_collections.
  const issueRows = await fetchChunked(
    candidateGcdIds,
    (chunk) => supabase.from("gcd_issues").select("gcd_id, series_gcd_id").in("series_gcd_id", chunk),
    "gcd_id"
  );
  console.log(`gcd_issues under candidate series: ${issueRows.length}`);
  const issueGcdIdToSeriesGcdId = new Map(issueRows.map((r) => [r.gcd_id, r.series_gcd_id]));
  const candidateIssueGcdIds = issueRows.map((r) => r.gcd_id);

  // 2. user_collections referencing those issues — the hard blocker.
  const ownedRows = await fetchChunked(
    candidateIssueGcdIds,
    (chunk) => supabase.from("user_collections").select("gcd_issue_id").not("gcd_issue_id", "is", null).in("gcd_issue_id", chunk),
    "id"
  );
  const seriesGcdIdsWithUserData = new Set();
  for (const row of ownedRows) {
    const seriesGcdId = issueGcdIdToSeriesGcdId.get(Number(row.gcd_issue_id));
    if (seriesGcdId != null) seriesGcdIdsWithUserData.add(seriesGcdId);
  }
  console.log(`user_collections rows referencing candidate issues: ${ownedRows.length}`);
  console.log(`Candidate series blocked by real user data: ${seriesGcdIdsWithUserData.size}`);

  // 3. `comics` rows (manual/local entries) referencing candidate series by series_id.
  const comicsRows = await fetchChunked(
    candidateSeriesIds,
    (chunk) => supabase.from("comics").select("id, series_id").in("series_id", chunk),
    "id"
  );
  const seriesIdsWithComicsRows = new Set(comicsRows.map((r) => r.series_id));
  console.log(`comics rows referencing candidate series: ${comicsRows.length}`);
  console.log(`Candidate series blocked by comics rows: ${seriesIdsWithComicsRows.size}`);

  // 4. canonical_covers still tagged to candidate gcd_ids — not a blocker,
  // but these need relinking to the correct allowlisted gcd_id first, not
  // deletion alongside the series (that would destroy real cover images).
  const coverRows = await fetchChunked(
    candidateGcdIds,
    (chunk) => supabase.from("canonical_covers").select("id, series_gcd_id").in("series_gcd_id", chunk).not("storage_path", "is", null),
    "id"
  );
  const seriesGcdIdsWithCovers = new Set(coverRows.map((r) => r.series_gcd_id));
  console.log(`canonical_covers still tagged to candidate series: ${coverRows.length}`);
  console.log(`Candidate series with covers needing relink first: ${seriesGcdIdsWithCovers.size}`);

  // Final breakdown.
  const seriesIdByGcdId = new Map(candidates.map((c) => [c.gcd_id, c.id]));
  let clean = 0, blockedByUserData = 0, needsRelinkOnly = 0, blockedByComics = 0;
  const cleanSample = [];
  for (const c of candidates) {
    const hasUserData = seriesGcdIdsWithUserData.has(c.gcd_id);
    const hasComics = seriesIdsWithComicsRows.has(c.id);
    const hasCovers = seriesGcdIdsWithCovers.has(c.gcd_id);
    if (hasUserData) { blockedByUserData++; continue; }
    if (hasComics) { blockedByComics++; continue; }
    if (hasCovers) { needsRelinkOnly++; continue; }
    clean++;
    if (cleanSample.length < 15) cleanSample.push(c.title);
  }

  console.log("\n── Summary ──");
  console.log(`Total candidates: ${candidates.length}`);
  console.log(`Clean — safe to delete outright: ${clean}`);
  console.log(`Needs cover relink first, then safe to delete: ${needsRelinkOnly}`);
  console.log(`Blocked — real user collection data: ${blockedByUserData}`);
  console.log(`Blocked — referenced by a manual comics row: ${blockedByComics}`);
  console.log("\nSample of clean candidates:", cleanSample);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
