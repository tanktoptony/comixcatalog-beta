import assert from "node:assert/strict";
import test from "node:test";

import { issueRowsFromJson, unmatchedCoverSeries, variantFieldsFromSeriesJson } from "./gcdIssueRefresh.js";

test("X-Men #40 is unmatched, then base and variants resolve to the base", () => {
  const detection = unmatchedCoverSeries(
    [{ series_gcd_id: 212762, issue_number: "40" }],
    new Map([[212762, [{ gcd_id: 1, issue_number: "39", variant_of_gcd_id: null }]]]),
  );
  assert.deepEqual(detection.seriesIds, [212762]);

  const known = new Map();
  const base = issueRowsFromJson(2875740, 212762, { number: "40 (340)", variant_name: "", variant_of: null }, known, "now");
  known.set(base.issue.gcd_id, base.issue);
  const a = issueRowsFromJson(2877171, 212762, { number: "40 (340)", variant_name: "[Pere Pérez Cover]", variant_of: "/api/issue/2875740/" }, known, "now");
  const b = issueRowsFromJson(2877172, 212762, { number: "40 (340)", variant_name: "Cover B", variant_of: "https://www.comics.org/api/issue/2875740/" }, known, "now");
  assert.equal(base.issue.base_gcd_issue_id, 2875740);
  assert.equal(base.issue.variant_name, null);
  assert.equal(a.issue.base_gcd_issue_id, 2875740);
  assert.equal(b.issue.base_gcd_issue_id, 2875740);
});

test("four copies of 1002 keep one base and three variants", () => {
  const known = new Map();
  const rows = [3000, 3001, 3002, 3003].map((id, index) => {
    const row = issueRowsFromJson(id, 222176, {
      number: "1002",
      variant_name: index ? `Cover ${index + 1}` : "",
      variant_of: index ? "/api/issue/3000/" : null,
    }, known, "now");
    known.set(id, row.issue);
    return row.issue;
  });
  assert.deepEqual(rows.map((row) => row.base_gcd_issue_id), [3000, 3000, 3000, 3000]);
  assert.equal(rows.filter((row) => row.variant_of_gcd_id === null).length, 1);
});

test("base resolution follows a variant-of-variant chain", () => {
  const known = new Map([
    [10, { gcd_id: 10, base_gcd_issue_id: 10, variant_of_gcd_id: null }],
    [11, { gcd_id: 11, base_gcd_issue_id: null, variant_of_gcd_id: 10 }],
  ]);
  const row = issueRowsFromJson(12, 1, { number: "1", variant_of: "/api/issue/11/" }, known, "now");
  assert.equal(row.issue.base_gcd_issue_id, 10);
});

test("variantFieldsFromSeriesJson reads bases and variants from one series response", () => {
  const url = (id) => `https://www.comics.org/api/issue/${id}/?format=json`;
  const fields = variantFieldsFromSeriesJson({
    active_issues: [url(2872336), url(2872350), url(2875740), url(2877172), url(2877171), url(9)],
    issue_descriptors: ["39 (339)", "39 (339) [Derrick Chew Cover]", "40 (340)", "40 (340) [Simone Di Meo Stormbreakers Cover]", "40 (340) [Pere Pérez Cover]", "41 [Orphan Variant]"],
  });
  assert.deepEqual(fields.get(2875740), { variant_of_gcd_id: null, variant_name: null, base_gcd_issue_id: 2875740 });
  assert.deepEqual(fields.get(2877171), { variant_of_gcd_id: 2875740, variant_name: "Pere Pérez Cover", base_gcd_issue_id: 2875740 });
  assert.deepEqual(fields.get(2872350), { variant_of_gcd_id: 2872336, variant_name: "Derrick Chew Cover", base_gcd_issue_id: 2872336 });
  assert.equal(fields.has(9), false);
});
