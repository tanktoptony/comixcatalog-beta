import { test } from "node:test";
import assert from "node:assert/strict";
import { issueChunkName, issueEntriesFromIds, parseIssueChunkName } from "./sitemapIssueChunks.js";

test("a chunk number survives the trip through its file name", () => {
  for (const chunk of [0, 1, 58, 20023]) {
    assert.equal(parseIssueChunkName(issueChunkName(chunk)), chunk);
  }
});

test("anything else is not a chunk", () => {
  for (const name of ["issues-", "issues-abc", "issues--1", "issues-1.5", "issues-1 ", "issues-99999999999", "series-0", "", null, undefined]) {
    assert.equal(parseIssueChunkName(name), null, String(name));
  }
});

test("entries use the one public issue URL, /issue/gcd-<n>", () => {
  assert.deepEqual(issueEntriesFromIds([293, 2757382], "https://www.comixcatalog.com"), [
    { url: "https://www.comixcatalog.com/issue/gcd-293" },
    { url: "https://www.comixcatalog.com/issue/gcd-2757382" },
  ]);
});

test("a missing list gives no entries", () => {
  assert.deepEqual(issueEntriesFromIds(null, "https://www.comixcatalog.com"), []);
});
