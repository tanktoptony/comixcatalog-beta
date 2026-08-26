// Executes the foreign-duplicate series purge scoped 2026-08-26: gcd_series
// entries that share an exact title with a series already resolved to a
// real, recognized publisher (US_PUBLISHER_ALLOWLIST) but themselves
// resolve to something else — foreign-language reprints, licensed
// editions, book-club editions. Deliberately NOT "everything outside the
// allowlist" (170k+ series, most of which are legitimate content simply
// not yet publisher-classified) — see scripts/auditForeignDuplicateSeries.js
// for the read-only version of this same query and the reasoning.
//
// Steps:
//   1. Rebuild the candidate set (same logic as the audit script).
//   2. Exclude any candidate still referenced by real user_collections data
//      — found one live case during audit (hotdogwater66 owns an issue
//      under a duplicate "Absolute Batman" gcd_id, 224764). That series
//      turned out to have a deeper problem on inspection: the "correct"
//      DC-resolved Absolute Batman entry (gcd_id 216143) itself has dozens
//      of duplicate rows per issue number — a separate, real bug, not
//      something to paper over inside this purge. ALL "Absolute Batman"
//      candidate gcd_ids are excluded from this pass pending a dedicated
//      investigation, not just the one with a live owner.
//   3. For candidates whose covers are still tagged to them, run the same
//      overlap-scoring relink logic already proven today (>=85% overlap,
//      >=15pt margin over runner-up) against the matching allowlisted
//      series. Relink if confident; if ambiguous, exclude that candidate
//      from deletion entirely rather than guess.
//   4. Delete gcd_issues, the app-facing `series` row, and gcd_series for
//      the final safe set. canonical_covers for included candidates should
//      be empty by this point (either never had any, or relinked in step 3).
//
// Usage:
//   node scripts/purgeForeignDuplicateSeries.js --dry-run
//   node scripts/purgeForeignDuplicateSeries.js

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes("--dry-run");

const PAGE = 1000;
const CHUNK = 300;
const OVERLAP_THRESHOLD = 0.85;
const MIN_MARGIN = 0.15;

// Known systemic problem found during the audit — excluded from this pass
// regardless of whether a specific gcd_id is user-blocked, since the whole
// title is tangled (duplicate issue rows within the "correct" series
// itself). See comment above.
const EXCLUDE_TITLES = new Set(["Absolute Batman"]);

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

async function fetchChunked(ids, build, orderCol) {
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    rows.push(...(await fetchAllPages(() => build(chunk), orderCol)));
  }
  return rows;
}

async function deleteChunked(table, column, ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).in(column, chunk);
    if (error) throw error;
    deleted += count ?? 0;
  }
  return deleted;
}

async function run() {
  console.log("Loading all series rows...");
  const allSeries = await fetchAllPages(
    () => supabase.from("series").select("id, gcd_id, title, resolved_publisher_cached").not("gcd_id", "is", null),
    "gcd_id"
  );
  const allowlistSet = new Set(US_PUBLISHER_ALLOWLIST);
  const allowlistedTitles = new Set();
  for (const r of allSeries) if (allowlistSet.has(r.resolved_publisher_cached)) allowlistedTitles.add(r.title);

  let candidates = allSeries.filter(
    (r) => !allowlistSet.has(r.resolved_publisher_cached) && allowlistedTitles.has(r.title)
  );
  const excludedForKnownIssue = candidates.filter((c) => EXCLUDE_TITLES.has(c.title));
  candidates = candidates.filter((c) => !EXCLUDE_TITLES.has(c.title));
  console.log(`Candidates: ${candidates.length} (excluded ${excludedForKnownIssue.length} under known-problem titles: ${[...EXCLUDE_TITLES].join(", ")})`);

  const candidateGcdIds = candidates.map((c) => c.gcd_id);
  const candidateSeriesIds = candidates.map((c) => c.id);

  console.log("Checking for real user data / manual comics references...");
  const issueRows = await fetchChunked(
    candidateGcdIds,
    (chunk) => supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number").in("series_gcd_id", chunk),
    "gcd_id"
  );
  const issueGcdIdToSeriesGcdId = new Map(issueRows.map((r) => [r.gcd_id, r.series_gcd_id]));
  const candidateIssueGcdIds = issueRows.map((r) => r.gcd_id);

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

  const comicsRows = await fetchChunked(
    candidateSeriesIds,
    (chunk) => supabase.from("comics").select("id, series_id").in("series_id", chunk),
    "id"
  );
  const seriesIdsWithComicsRows = new Set(comicsRows.map((r) => r.series_id));

  console.log(`Blocked by real user data: ${seriesGcdIdsWithUserData.size}`);
  console.log(`Blocked by manual comics rows: ${seriesIdsWithComicsRows.size}`);

  // Covers still tagged to candidates — need relinking before those specific
  // candidates can be deleted.
  const coverRows = await fetchChunked(
    candidateGcdIds,
    (chunk) => supabase.from("canonical_covers").select("id, series_gcd_id, issue_number").in("series_gcd_id", chunk).not("storage_path", "is", null),
    "id"
  );
  const coversByGcdId = new Map();
  for (const row of coverRows) {
    if (!coversByGcdId.has(row.series_gcd_id)) coversByGcdId.set(row.series_gcd_id, []);
    coversByGcdId.get(row.series_gcd_id).push(row);
  }
  console.log(`Candidates with covers needing relink: ${coversByGcdId.size}`);

  // Build title -> allowlisted gcd_id(s) index, and issue-number sets for
  // each allowlisted series, to score relink targets.
  const allowlistedByTitle = new Map();
  for (const r of allSeries) {
    if (!allowlistSet.has(r.resolved_publisher_cached)) continue;
    if (!allowlistedByTitle.has(r.title)) allowlistedByTitle.set(r.title, []);
    allowlistedByTitle.get(r.title).push(r.gcd_id);
  }
  const allowlistedGcdIdsNeedingIssues = [...new Set(candidates.filter((c) => coversByGcdId.has(c.gcd_id)).flatMap((c) => allowlistedByTitle.get(c.title) ?? []))];
  const allowlistedIssueRows = await fetchChunked(
    allowlistedGcdIdsNeedingIssues,
    (chunk) => supabase.from("gcd_issues").select("series_gcd_id, issue_number").in("series_gcd_id", chunk),
    "gcd_id"
  );
  const allowlistedIssueSets = new Map();
  for (const row of allowlistedIssueRows) {
    const base = baseIssueNumber(row.issue_number);
    if (!base) continue;
    if (!allowlistedIssueSets.has(row.series_gcd_id)) allowlistedIssueSets.set(row.series_gcd_id, new Set());
    allowlistedIssueSets.get(row.series_gcd_id).add(base);
  }

  const relinkPlan = [];
  const ambiguousCandidateGcdIds = new Set();
  for (const c of candidates) {
    const covers = coversByGcdId.get(c.gcd_id);
    if (!covers) continue;
    const volIssueNumbers = new Set(covers.map((r) => baseIssueNumber(r.issue_number)).filter(Boolean));
    const targetIds = allowlistedByTitle.get(c.title) ?? [];
    let best = null, second = null;
    for (const targetId of targetIds) {
      const targetSet = allowlistedIssueSets.get(targetId);
      if (!targetSet || targetSet.size === 0) continue;
      let matched = 0;
      for (const n of volIssueNumbers) if (targetSet.has(n)) matched++;
      const overlap = volIssueNumbers.size ? matched / volIssueNumbers.size : 0;
      if (!best || overlap > best.overlap) { second = best; best = { targetId, overlap }; }
      else if (!second || overlap > second.overlap) { second = { targetId, overlap }; }
    }
    if (!best || best.overlap < OVERLAP_THRESHOLD || (second && best.overlap - second.overlap < MIN_MARGIN)) {
      ambiguousCandidateGcdIds.add(c.gcd_id);
      continue;
    }
    relinkPlan.push({ fromGcdId: c.gcd_id, toGcdId: best.targetId, coverIds: covers.map((r) => r.id), title: c.title, overlap: best.overlap });
  }
  console.log(`Relink plan: ${relinkPlan.length} candidates confidently resolved, ${ambiguousCandidateGcdIds.size} ambiguous (excluded from deletion)`);

  // Final deletable set: candidates that are not blocked by user data,
  // not blocked by comics rows, and either had no covers or got a
  // confident relink plan (i.e. not in the ambiguous set).
  const deletable = candidates.filter(
    (c) =>
      !seriesGcdIdsWithUserData.has(c.gcd_id) &&
      !seriesIdsWithComicsRows.has(c.id) &&
      !ambiguousCandidateGcdIds.has(c.gcd_id)
  );
  console.log(`\nFinal deletable series: ${deletable.length} of ${candidates.length} candidates`);
  console.log(`(excluded: ${seriesGcdIdsWithUserData.size} user-blocked, ${seriesIdsWithComicsRows.size} comics-blocked, ${ambiguousCandidateGcdIds.size} ambiguous, ${excludedForKnownIssue.length} known-problem-title)`);

  if (DRY_RUN) {
    console.log("\n[dry-run] Relink plan sample:", relinkPlan.slice(0, 10));
    console.log("[dry-run] No writes performed.");
    return;
  }

  console.log(`\nApplying ${relinkPlan.length} relinks...`);
  let relinkedCovers = 0;
  for (const plan of relinkPlan) {
    for (let i = 0; i < plan.coverIds.length; i += 500) {
      const chunk = plan.coverIds.slice(i, i + 500);
      const { error, data } = await supabase.from("canonical_covers").update({ series_gcd_id: plan.toGcdId }).in("id", chunk).select("id");
      if (error) { console.error(`  relink failed for ${plan.title} (${plan.fromGcdId} -> ${plan.toGcdId}):`, error.message); continue; }
      relinkedCovers += data?.length ?? 0;
    }
  }
  console.log(`Covers relinked: ${relinkedCovers}`);

  const deletableGcdIds = deletable.map((c) => c.gcd_id);
  const deletableSeriesIds = deletable.map((c) => c.id);

  console.log("\nDeleting gcd_issues under deletable series...");
  const deletedIssues = await deleteChunked("gcd_issues", "series_gcd_id", deletableGcdIds);
  console.log(`gcd_issues deleted: ${deletedIssues}`);

  console.log("Deleting app-facing series rows...");
  const deletedSeries = await deleteChunked("series", "id", deletableSeriesIds);
  console.log(`series rows deleted: ${deletedSeries}`);

  console.log("Deleting gcd_series rows...");
  const deletedGcdSeries = await deleteChunked("gcd_series", "gcd_id", deletableGcdIds);
  console.log(`gcd_series rows deleted: ${deletedGcdSeries}`);

  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
