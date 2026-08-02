import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  baseIssueNumber,
  createCoverMatcher,
  pickSeriesByYear,
  publishersCompatible,
} from "./coverMatch.js";

const fixture = JSON.parse(
  fs.readFileSync(new URL("../../scripts/fixtures/cover-match-cases.json", import.meta.url))
);

function fakeSupabase(tables) {
  return {
    from(table) {
      const query = {
        select() { return query; }, not() { return query; }, order() { return query; }, range() { return query; },
        eq(column, value) { query.filter = [column, value]; return query; },
        then(resolve) {
          let data = tables[table] ?? [];
          if (query.filter) data = data.filter((row) => row[query.filter[0]] === query.filter[1]);
          resolve({ data, error: null });
        },
      };
      return query;
    },
  };
}

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

test("publisher compatibility rejects cross-major matches", () => {
  assert.equal(publishersCompatible("Marvel Comics", "Marvel"), true);
  assert.equal(publishersCompatible("DC Comics", "Marvel Comics"), false);
  assert.equal(publishersCompatible("Dark Horse Comics", "Marvel Comics"), false);
});

test("series resolution requires publisher and a unique year winner", async () => {
  const supabase = fakeSupabase({
    series: [
      { gcd_id: 1, title: "Usagi Yojimbo", year_start_cached: 2007, resolved_publisher_cached: "Marvel Comics" },
      { gcd_id: 2, title: "Usagi Yojimbo", year_start_cached: 2007, resolved_publisher_cached: "Dark Horse Comics" },
    ],
  });
  const matcher = createCoverMatcher(supabase);
  assert.equal(await matcher.resolveSeriesGcdId({
    title: "Usagi Yojimbo", year: 2007, publisher: "Dark Horse Comics",
  }), 2);
});

test("joint cover resolution uses issue date instead of series start year", async () => {
  const tables = {
    series: [
      { gcd_id: 10, title: "Batman", year_start_cached: 1940, resolved_publisher_cached: "DC Comics" },
      { gcd_id: 20, title: "Batman", year_start_cached: 1957, resolved_publisher_cached: "DC Comics" },
      { gcd_id: 30, title: "Batman", year_start_cached: 1957, resolved_publisher_cached: "Marvel Comics" },
    ],
    gcd_issues: [
      { gcd_id: 100, series_gcd_id: 10, issue_number: "105", publication_date: "1957-02-01" },
      { gcd_id: 200, series_gcd_id: 20, issue_number: "1", publication_date: "1957-02-01" },
      { gcd_id: 300, series_gcd_id: 30, issue_number: "105", publication_date: "1957-02-01" },
    ],
  };
  const result = await createCoverMatcher(fakeSupabase(tables)).resolveCoverLink({
    title: "Batman", publisher: "DC Comics", issueNumber: "105", coverYear: 1957,
  });
  assert.deepEqual(result, { seriesGcdId: 10, gcdIssueId: 100, matchConfidence: "resolved" });
});

test("joint cover resolution reads display-formatted GCD publication dates", async () => {
  const tables = {
    series: [
      { gcd_id: 1747, title: "Marvel Tales", year_start_cached: 1966, resolved_publisher_cached: "Marvel Comics" },
      { gcd_id: 71181, title: "Marvel Tales", year_start_cached: 1977, resolved_publisher_cached: "Yaffa Publishing Group" },
    ],
    gcd_issues: [
      { gcd_id: 33141, series_gcd_id: 1747, issue_number: "100", publication_date: "February 1979", key_date: "1979-02-00" },
    ],
  };
  assert.deepEqual(await createCoverMatcher(fakeSupabase(tables)).resolveCoverLink({
    title: "Marvel Tales", publisher: "Marvel", issueNumber: "100", coverYear: 1979,
  }), { seriesGcdId: 1747, gcdIssueId: 33141, matchConfidence: "resolved" });
});

test("joint cover resolution rejects article-order candidates tied on issue evidence", async () => {
  const tables = {
    series: [
      { gcd_id: 1, title: "The Avengers", year_start_cached: 1963, resolved_publisher_cached: "Marvel Comics" },
      { gcd_id: 2, title: "Avengers, The", year_start_cached: 1963, resolved_publisher_cached: "Marvel Comics" },
    ],
    gcd_issues: [
      { gcd_id: 11, series_gcd_id: 1, issue_number: "1", publication_date: "1963-09-01" },
      { gcd_id: 22, series_gcd_id: 2, issue_number: "1", publication_date: "1963-09-01" },
    ],
  };
  assert.deepEqual(await createCoverMatcher(fakeSupabase(tables)).resolveCoverLink({
    title: "The Avengers", publisher: "Marvel", issueNumber: "1", coverYear: 1963,
  }), { seriesGcdId: null, gcdIssueId: null, matchConfidence: "unresolved" });
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
