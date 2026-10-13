import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKeyRows,
  isExcludedTitle,
  firstAppearancesByCvIssue,
  keyReason,
  keyTier,
  normalizeIssueNumber,
} from "./keyIssuesFromCrawl.js";

const page = (results) => ({ results });
const ch = (name, appearances, cvIssue, issueNumber, publisher = "Marvel") => ({
  name,
  count_of_issue_appearances: appearances,
  first_appeared_in_issue: { id: cvIssue, issue_number: issueNumber },
  publisher: { name: publisher },
});

test("filters by appearances and excluded publishers, sorts by appearances", () => {
  const map = firstAppearancesByCvIssue([
    page([
      ch("Venom", 3000, 10, "300"),
      ch("Minor Guy", 12, 10, "300"),
      ch("Abraham Lincoln", 900, 11, "1", "Non-Fictional"),
      ch("Dracula", 900, 12, "1", "In the Public Domain"),
      ch("Eddie Brock", 800, 10, "300"),
    ]),
  ], { minAppearances: 50 });
  assert.deepEqual([...map.keys()], [10]);
  assert.deepEqual(map.get(10).characters.map((c) => c.name), ["Venom", "Eddie Brock"]);
  assert.equal(map.get(10).cvIssueNumber, "300");
});

test("tier 1 only at 1000+ appearances", () => {
  assert.equal(keyTier(1000), 1);
  assert.equal(keyTier(999), 2);
});

test("reason wording", () => {
  assert.equal(keyReason(["Venom"]), "1st appearance of Venom");
  assert.equal(keyReason(["A", "B"]), "1st appearances of A and B");
  assert.equal(keyReason(["A", "B", "C"]), "1st appearances of A, B and C");
  assert.equal(keyReason(["A", "B", "C", "D"]), "1st appearances of A, B, C and more");
});

test("issue numbers normalize leading zeros and #", () => {
  assert.equal(normalizeIssueNumber("#001"), "1");
  assert.equal(normalizeIssueNumber("0"), "0");
  assert.equal(normalizeIssueNumber("300"), "300");
});

test("buildKeyRows: skips unlinked, mismatched numbers and existing keys; merges CV issues on one GCD issue", () => {
  const byCvIssue = firstAppearancesByCvIssue([
    page([
      ch("Venom", 3000, 10, "300"),
      ch("Eddie Brock", 800, 99, "300"), // second CV id for the same book
      ch("Wrong Book", 500, 20, "5"),
      ch("No Link", 500, 30, "1"),
      ch("Curated", 5000, 40, "15"),
    ]),
  ]);
  const gcdIdByCvIssue = new Map([[10, 1001], [99, 1001], [20, 2002], [40, 4004]]);
  const issueByGcdId = new Map([
    [1001, { issue_number: "300", title: "The Amazing Spider-Man", publisher: "Marvel", year: 1988 }],
    [2002, { issue_number: "6", title: "Somebody", publisher: "Marvel", year: 1990 }],
    [4004, { issue_number: "15", title: "Amazing Fantasy", publisher: "Marvel", year: 1962 }],
  ]);
  const { rows, skipped } = buildKeyRows({ byCvIssue, gcdIdByCvIssue, issueByGcdId, existingGcdIds: new Set([4004]) });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    gcd_issue_id: 1001,
    title: "The Amazing Spider-Man",
    issue_number: "300",
    publisher: "Marvel",
    year: 1988,
    character: "Venom",
    reason: "1st appearances of Venom and Eddie Brock",
    tier: 1,
  });
  assert.deepEqual(skipped, { noGcdLink: 1, noIssue: 0, numberMismatch: 1, alreadyKey: 1, promoBook: 0 });
});

test("promo and reference books are not keys; real anthologies are", () => {
  assert.equal(isExcludedTitle("Marvel Age"), true);
  assert.equal(isExcludedTitle("DC Sampler"), true);
  assert.equal(isExcludedTitle("Who's Who: The Definitive Directory of the DC Universe"), true);
  assert.equal(isExcludedTitle("Malibu Sun Preview Special"), true);
  assert.equal(isExcludedTitle("Marvel Preview"), false);
  assert.equal(isExcludedTitle("Free Comic Book Day 2007 (Spider-Man)"), false);
  assert.equal(isExcludedTitle("The Amazing Spider-Man"), false);
});

test("buildKeyRows drops a key that lands in a promo book", () => {
  const byCvIssue = firstAppearancesByCvIssue([page([ch("Ghost Rider (Ketch)", 900, 7, "87")])]);
  const { rows, skipped } = buildKeyRows({
    byCvIssue,
    gcdIdByCvIssue: new Map([[7, 70]]),
    issueByGcdId: new Map([[70, { issue_number: "87", title: "Marvel Age", publisher: "Marvel", year: 1990 }]]),
  });
  assert.equal(rows.length, 0);
  assert.equal(skipped.promoBook, 1);
});
