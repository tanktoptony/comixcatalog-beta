import assert from "node:assert/strict";
import test from "node:test";

import { cachedIssueCount, parseIssueDescriptor, provisionalIssueRows, qualifiesForCatalogImport } from "./gcdSeriesImport.js";

test("parseIssueDescriptor separates bracketed editions", () => {
  assert.deepEqual(parseIssueDescriptor("1 [Newsstand]"), { issueNumber: "1", variant: "Newsstand" });
  assert.deepEqual(parseIssueDescriptor("3"), { issueNumber: "3", variant: null });
  assert.deepEqual(parseIssueDescriptor(""), { issueNumber: null, variant: null });
});

test("qualifiesForCatalogImport keeps English US/Canadian series with issues", () => {
  const base = { name: "Street Fighter", language: "en", active_issues: ["issue"] };
  assert.equal(qualifiesForCatalogImport({ ...base, country: "us" }), true);
  assert.equal(qualifiesForCatalogImport({ ...base, country: "ca" }), true);
  assert.equal(qualifiesForCatalogImport({ ...base, country: "ca", language: "fr" }), false);
  assert.equal(qualifiesForCatalogImport({ ...base, country: "gb" }), false);
  assert.equal(qualifiesForCatalogImport({ ...base, name: "[no title]" }), false);
  assert.equal(qualifiesForCatalogImport({ ...base, active_issues: [] }), false);
});

test("provisional issues use descriptor numbers and preserve edition rows", () => {
  const rows = provisionalIssueRows({
    api_url: "https://www.comics.org/api/series/15154/?format=json",
    publisher: "https://www.comics.org/api/publisher/54/?format=json",
    active_issues: [
      "https://www.comics.org/api/issue/1/?format=json",
      "https://www.comics.org/api/issue/2/?format=json",
    ],
    issue_descriptors: ["1 [Newsstand]", "1 [Direct]"],
  });
  assert.deepEqual(rows.map((row) => row.issue_number), ["1 [Newsstand]", "1 [Direct]"]);
  assert.equal(cachedIssueCount(rows), 1);
});
