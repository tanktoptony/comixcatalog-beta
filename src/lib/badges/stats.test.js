import test from "node:test";
import assert from "node:assert/strict";
import { reduceBadgeStats } from "./stats.js";

test("reduceBadgeStats counts copies, keys, eras, publishers, slabs and complete runs", () => {
  const issues = [
    { gcd_id: 1, series_gcd_id: 10, publication_date: "1955-01-01", variant_of_gcd_id: null },
    { gcd_id: 2, series_gcd_id: 10, publication_date: "1960-01-01", variant_of_gcd_id: null },
    { gcd_id: 3, series_gcd_id: 10, publication_date: "1975-01-01", variant_of_gcd_id: null },
    { gcd_id: 4, series_gcd_id: 10, publication_date: "1988-01-01", variant_of_gcd_id: null },
  ];
  const collections = issues.map((issue, index) => ({ status: index === 1 ? "for_sale" : "owned", gcd_issue_id: issue.gcd_id, slab_company: index === 0 ? "CGC" : null, grade_numeric: index === 0 ? 9.8 : null }));
  collections.push({ status: "wishlist", gcd_issue_id: 99 });
  const stats = reduceBadgeStats({ collections, issues, series: [{ gcd_id: 10, resolved_publisher_cached: "Marvel Comics" }], keys: [{ gcd_issue_id: 2, tier: 1 }], rulings: [] });
  assert.equal(stats.ownedCount, 4);
  assert.equal(stats.wantlistCount, 1);
  assert.equal(stats.majorKeyCount, 1);
  assert.equal(stats.silverKeyCount, 1);
  assert.equal(stats.publisherCounts.marvel, 4);
  assert.equal(stats.completedRunCount, 1);
  assert.equal(stats.slabbedCount, 1);
  assert.equal(stats.nineEightCount, 1);
});

test("latest not-key ruling excludes a curated key", () => {
  const stats = reduceBadgeStats({
    collections: [{ status: "owned", gcd_issue_id: 1 }],
    issues: [{ gcd_id: 1, series_gcd_id: 10, publication_date: "1960-01-01", variant_of_gcd_id: null }],
    keys: [{ gcd_issue_id: 1, tier: 1 }],
    rulings: [{ gcd_issue_id: 1, verdict: "not_key" }],
  });
  assert.equal(stats.keyCount, 0);
  assert.equal(stats.silverKeyCount, 0);
});
