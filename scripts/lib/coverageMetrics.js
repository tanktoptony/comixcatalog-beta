// Shared cover-coverage computation — the canonical numbers behind "where
// are covers at?" Extracted 2026-08-28 from scripts/reportCatalogCoverage.js
// so the nightly report can show the same real target metric instead of
// covers-added-per-day alone (which answers "is the pipeline running?" but
// not "how far from done are we?", and invites exactly the wrong comparison
// — subtracting a per-issue covers count from a per-series count — that
// prompted this file existing).
//
// Three numbers exist and only one is the one to track over time:
//   - Raw (covers / all gcd_issues): denominator includes ~2M foreign
//     reprints, licensed editions, and GCD ephemera nobody will ever search
//     for. Always looks catastrophically low — not actionable.
//   - Launch-gate priority (covers / issues tied to real user collections,
//     wishlists, key issues, and featured picks): denominator is whatever
//     users happen to have added so far. Always looks great, tells you
//     nothing about the other tens of thousands of legitimate series nobody
//     has touched yet.
//   - Allowlisted-corpus (covers / every issue from the ~45 publishers in
//     US_PUBLISHER_ALLOWLIST — src/lib/publisher.js): the actual Discogs-
//     equivalent target. Every real, commercially-released English-market
//     comic, excluding foreign reprints/licensed editions and GCD noise.
//     THIS is the canonical number — see CLAUDE.md's "Cover Coverage"
//     section.
//
// Confirmed 2026-08-26: an earlier ad-hoc version of this query omitted
// .order() on the paginated fetches. Without a stable sort, .range()-based
// pagination over an unordered query can skip or duplicate rows across page
// boundaries — silently undercounted covered issues by ~2/3 (24k vs the
// real 73k). Both queries below are explicitly ordered by their real PK.

import { US_PUBLISHER_ALLOWLIST } from "../../src/lib/publisher.js";
import { baseIssueNumber } from "../../src/lib/coverMatch.js";

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

// Returns the full metric set as plain numbers — callers decide how to
// render/format/percentify. Takes a couple seconds (paginated scans over
// ~47k allowlisted series and ~110k cover rows as of 2026-08-28).
export async function computeCoverageMetrics(supabase) {
  const [{ count: totalIssuesRaw, error: e1 }, { count: totalCoversRaw, error: e2 }] = await Promise.all([
    supabase.from("gcd_issues").select("gcd_id", { count: "exact", head: true }),
    supabase.from("canonical_covers").select("id", { count: "exact", head: true }).not("storage_path", "is", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

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
  let coveredIssues = 0;
  for (const set of coveredByGcdId.values()) coveredIssues += set.size;

  return {
    // Raw
    totalIssuesRaw,
    totalCoversRaw,
    rawCoveragePct: totalIssuesRaw ? (100 * totalCoversRaw) / totalIssuesRaw : null,
    // Allowlisted corpus — the canonical number
    allowlistedPublisherCount: US_PUBLISHER_ALLOWLIST.length,
    allowlistedSeriesCount: allowlistedGcdIds.size,
    totalAllowlistedIssues,
    coveredIssues,
    remainingIssues: totalAllowlistedIssues - coveredIssues,
    allowlistedCoveragePct: totalAllowlistedIssues ? (100 * coveredIssues) / totalAllowlistedIssues : null,
    seriesWithCoverCount: coveredByGcdId.size,
    seriesZeroCoverCount: allowlistedGcdIds.size - coveredByGcdId.size,
  };
}
