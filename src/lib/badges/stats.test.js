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

test("secret badge counts: special numbers, copies, busiest day, series span, books nobody else has", () => {
  const issues = [
    { gcd_id: 1, series_gcd_id: 10, issue_number: "0", publication_date: "1965-01-01" },
    { gcd_id: 2, series_gcd_id: 10, issue_number: "100 [Canadian]", publication_date: "2005-01-01" },
    { gcd_id: 3, series_gcd_id: 20, issue_number: "1/2", publication_date: "1998-01-01" },
    { gcd_id: 4, series_gcd_id: 20, issue_number: "1,000,000", publication_date: "1998-11-01" },
    { gcd_id: 5, series_gcd_id: 20, issue_number: "01", publication_date: "1998-01-01" },
    { gcd_id: 6, series_gcd_id: 20, issue_number: "100/101", publication_date: "1999-01-01" },
    { gcd_id: 7, series_gcd_id: 20, issue_number: "21/2005", publication_date: "2005-01-01" },
  ];
  const collections = [
    ...issues.map((issue) => ({ status: "owned", gcd_issue_id: issue.gcd_id, created_at: "2026-11-01T10:00:00Z" })),
    { status: "for_sale", gcd_issue_id: 1, created_at: "2026-11-02T10:00:00Z" },
    { status: "wishlist", gcd_issue_id: 2, created_at: "2026-11-02T10:00:00Z" },
    // Two hand-added books: no catalog issue, so not copies of one issue.
    { status: "owned", gcd_issue_id: null, comic_id: "a", created_at: "2026-11-03T10:00:00Z" },
    { status: "owned", gcd_issue_id: null, comic_id: "b", created_at: "2026-11-03T10:00:00Z" },
  ];
  const stats = reduceBadgeStats({ collections, issues, sharedIssueIds: new Set([1, 2, 3, 4, 5, 6]) });
  assert.equal(stats.zeroIssueCount, 2); // two copies of #0; "01" is a #1
  assert.equal(stats.centennialCount, 1); // "100/101" doesn't count
  assert.equal(stats.halfIssueCount, 1); // "21/2005" doesn't count
  assert.equal(stats.oneMillionCount, 1);
  assert.equal(stats.duplicateIssueCount, 1);
  assert.equal(stats.busiestDayAdds, 7); // the wishlist add doesn't count
  assert.equal(stats.seriesSpanYears, 40);
  assert.equal(stats.uniqueBookCount, 1);
});

test("one of a kind stays at zero when nobody looked up other owners", () => {
  const stats = reduceBadgeStats({ collections: [{ status: "owned", gcd_issue_id: 1 }], issues: [{ gcd_id: 1, series_gcd_id: 10, issue_number: "1" }] });
  assert.equal(stats.uniqueBookCount, 0);
  assert.equal(stats.busiestDayAdds, 0);
});
