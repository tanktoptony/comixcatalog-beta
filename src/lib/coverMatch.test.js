import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { baseIssueNumber, createCoverMatcher, pickSeriesByYear } from "./coverMatch.js";

const fixture = JSON.parse(
  fs.readFileSync(new URL("../../scripts/fixtures/cover-match-cases.json", import.meta.url))
);

test("baseIssueNumber matches the ingestion fixture", () => {
  for (const row of fixture.issueNumbers) {
    assert.equal(baseIssueNumber(row.input), row.base, row.input);
  }
});

test("pickSeriesByYear disambiguates repeated titles", () => {
  const candidates = [
    { gcd_id: 1, year_start_cached: 1988 },
    { gcd_id: 2, year_start_cached: 2007 },
  ];
  assert.equal(pickSeriesByYear(candidates, 2008)?.gcd_id, 2);
});

test("issue resolution prefers exact and rejects ambiguous base variants", async () => {
  const tables = {
    series: [{ gcd_id: 10, title: "Example", year_start_cached: 1993 }],
    gcd_issues: [
      { gcd_id: 100, series_gcd_id: 10, issue_number: "1", publication_date: "1993" },
      { gcd_id: 103, series_gcd_id: 10, issue_number: "1", publication_date: "1993" },
      { gcd_id: 101, series_gcd_id: 10, issue_number: "2 [Direct]" },
      { gcd_id: 102, series_gcd_id: 10, issue_number: "2 [Newsstand]" },
    ],
  };
  const supabase = {
    from(table) {
      const query = {
        select() { return query; }, not() { return query; }, order() { return query; },
        eq(column, value) { query.filter = [column, value]; return query; },
        then(resolve) {
          let data = tables[table];
          if (query.filter) data = data.filter((row) => row[query.filter[0]] === query.filter[1]);
          resolve({ data, error: null });
        },
        range() { return query; },
      };
      return query;
    },
  };
  const matcher = createCoverMatcher(supabase);
  assert.deepEqual(await matcher.resolveGcdIssueId({ seriesGcdId: 10, issueNumber: "1" }), {
    gcdIssueId: 100, matchConfidence: "resolved",
  });
  assert.deepEqual(await matcher.resolveGcdIssueId({ seriesGcdId: 10, issueNumber: "2" }), {
    gcdIssueId: null, matchConfidence: "series-only",
  });
});
