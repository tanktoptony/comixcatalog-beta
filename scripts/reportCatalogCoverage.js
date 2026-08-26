// Real cover-coverage report, replacing ad-hoc one-off queries. Three
// numbers matter, and none of them alone tells the truth:
//
//   - Raw (covers / all gcd_issues): denominator includes ~2M foreign
//     reprints, licensed editions, and GCD ephemera nobody will ever search
//     for. Always looks catastrophically low — not actionable.
//   - Launch-gate priority (covers / issues tied to real user collections,
//     wishlists, key issues, and featured picks): denominator is whatever
//     users happen to have added so far. Always looks great, tells you
//     nothing about the other 47k+ legitimate series nobody's touched yet.
//   - Allowlisted-corpus (covers / every issue from the ~45 publishers in
//     US_PUBLISHER_ALLOWLIST — src/lib/publisher.js): the actual Discogs-
//     equivalent target. Every real, commercially-released English-market
//     comic, excluding foreign reprints/licensed editions and GCD noise.
//     This is the number to track over time.
//
// Confirmed 2026-08-26: an earlier ad-hoc version of this query omitted
// .order() on the paginated fetches. Without a stable sort, .range()-based
// pagination over an unordered query can skip or duplicate rows across page
// boundaries — silently undercounted covered issues by ~2/3 (24k vs the
// real 73k). Both queries below are explicitly ordered by their real PK.
//
// Usage: node scripts/reportCatalogCoverage.js

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PAGE = 1000;

async function fetchAllPages(build, orderCol) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order(orderCol).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function run() {
  const [{ count: totalIssues }, { count: totalCovers }] = await Promise.all([
    supabase.from("gcd_issues").select("gcd_id", { count: "exact", head: true }),
    supabase.from("canonical_covers").select("id", { count: "exact", head: true }).not("storage_path", "is", null),
  ]);

  console.log("── Raw (not actionable, denominator includes foreign/ephemera) ──");
  console.log(`Total gcd_issues: ${totalIssues}`);
  console.log(`Total canonical_covers: ${totalCovers}`);
  console.log(`Raw coverage: ${(100 * totalCovers / totalIssues).toFixed(2)}%`);

  console.log("\n── Allowlisted corpus (the real target) ──");
  const seriesRows = await fetchAllPages(
    () =>
      supabase
        .from("series")
        .select("gcd_id, issue_count_cached, resolved_publisher_cached")
        .in("resolved_publisher_cached", US_PUBLISHER_ALLOWLIST)
        .not("gcd_id", "is", null),
    "gcd_id"
  );

  const issuesByGcdId = new Map();
  for (const r of seriesRows) {
    const existing = issuesByGcdId.get(r.gcd_id);
    if (existing == null || (r.issue_count_cached ?? 0) > existing) {
      issuesByGcdId.set(r.gcd_id, r.issue_count_cached ?? 0);
    }
  }
  const totalAllowlistedIssues = [...issuesByGcdId.values()].reduce((a, b) => a + b, 0);
  console.log(`Allowlisted publishers: ${US_PUBLISHER_ALLOWLIST.length}`);
  console.log(`Allowlisted series: ${issuesByGcdId.size}`);
  console.log(`Allowlisted issues (variant-deduped): ${totalAllowlistedIssues}`);

  const allowlistedGcdIds = new Set(issuesByGcdId.keys());
  const coverRows = await fetchAllPages(
    () =>
      supabase
        .from("canonical_covers")
        .select("id, series_gcd_id, issue_number")
        .not("storage_path", "is", null)
        .not("series_gcd_id", "is", null),
    "id"
  );

  const coveredByGcdId = new Map();
  for (const row of coverRows) {
    if (!allowlistedGcdIds.has(row.series_gcd_id)) continue;
    const base = baseIssueNumber(row.issue_number);
    if (!base) continue;
    if (!coveredByGcdId.has(row.series_gcd_id)) coveredByGcdId.set(row.series_gcd_id, new Set());
    coveredByGcdId.get(row.series_gcd_id).add(base);
  }
  let distinctCovered = 0;
  for (const set of coveredByGcdId.values()) distinctCovered += set.size;

  console.log(`Covered issues: ${distinctCovered}`);
  console.log(`Coverage: ${(100 * distinctCovered / totalAllowlistedIssues).toFixed(2)}%`);
  console.log(`Series with >=1 cover: ${coveredByGcdId.size} of ${allowlistedGcdIds.size}`);
  console.log(`Series with zero covers: ${allowlistedGcdIds.size - coveredByGcdId.size}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
