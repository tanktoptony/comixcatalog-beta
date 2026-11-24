import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKeyRows,
  isParodyTitle,
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
  assert.deepEqual(skipped, { noGcdLink: 1, noIssue: 0, numberMismatch: 1, wrongEdition: 0, nonUs: 0, alreadyKey: 1, promoBook: 0, parody: 0, knownWrong: 0, nameKeyed: 0 });
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

test("buildKeyRows skips keys linked to a reprint edition", () => {
  const byCvIssue = firstAppearancesByCvIssue([
    page([
      ch("Shorty", 120, 1, "64", "DC Comics"), // US cover on the Australian K.G. Murray reprint
      ch("Lord of the Locusts", 120, 2, "17", "Cartoon Books"), // 1995 cover on the 1997 Image reprint
      ch("Real One", 120, 3, "5", "DC Comics"),
    ]),
  ]);
  const { rows, skipped } = buildKeyRows({
    byCvIssue,
    gcdIdByCvIssue: new Map([[1, 10], [2, 20], [3, 30]]),
    issueByGcdId: new Map([
      [10, { issue_number: "64", title: "Superman", publisher: "K. G. Murray", year: null, seriesGcdId: 900, usMarket: false }],
      [20, { issue_number: "17", title: "Bone", publisher: "Image Comics", year: 1997, seriesGcdId: 901, usMarket: true }],
      [30, { issue_number: "5", title: "Batman", publisher: "DC Comics", year: 2012, seriesGcdId: 902, usMarket: true }],
    ]),
    coverByCvIssue: new Map([
      [1, { year: 1950, seriesGcdId: 116 }],
      [2, { year: 1995, seriesGcdId: 4347 }],
      [3, { year: 2012, seriesGcdId: 141 }], // wrong series id on the cover row alone is not enough
    ]),
  });
  assert.deepEqual(rows.map((r) => r.gcd_issue_id), [30]);
  assert.equal(skipped.wrongEdition, 2);
});

test("buildKeyRows moves a key off a variant record onto the regular edition", () => {
  const byCvIssue = firstAppearancesByCvIssue([page([ch("Somebody", 120, 1, "14")])]);
  const { rows } = buildKeyRows({
    byCvIssue,
    gcdIdByCvIssue: new Map([[1, 11]]),
    issueByGcdId: new Map([
      [11, { issue_number: "14", title: "Wolverine", publisher: "Marvel", year: 2021, variantOf: 10 }],
      [10, { issue_number: "14", title: "Wolverine", publisher: "Marvel", year: 2021 }],
    ]),
  });
  assert.deepEqual(rows.map((r) => r.gcd_issue_id), [10]);
});

test("buildKeyRows drops parody magazines, non-US editions, known-wrong credits and already-keyed names", () => {
  const byCvIssue = firstAppearancesByCvIssue([
    page([
      ch("Walter White", 120, 1, "516"),
      ch("Tony Chu", 120, 2, "1"),
      ch("Apocalypse", 2000, 3, "17"),
      ch("Black Widow", 120, 4, "4"),
      ch("Shang-Chi", 1500, 5, "15"),
    ]),
  ]);
  const issue = (title, n, extra = {}) => ({ issue_number: n, title, publisher: "X", year: 1990, usMarket: true, ...extra });
  const { rows, skipped } = buildKeyRows({
    byCvIssue,
    gcdIdByCvIssue: new Map([[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]]),
    issueByGcdId: new Map([
      [10, issue("Mad", "516")],
      [20, issue("Chew", "1", { usMarket: false })],
      [30, issue("Marvel Graphic Novel", "17")],
      [40, issue("Cartoon Network Starring", "4")],
      [50, issue("Special Marvel Edition", "15")],
    ]),
    existingCharacters: new Set(["black widow"]),
  });
  assert.deepEqual(rows.map((r) => r.gcd_issue_id), [50]);
  assert.equal(skipped.parody, 1);
  assert.equal(skipped.nonUs, 1);
  assert.equal(skipped.knownWrong, 1);
  assert.equal(skipped.nameKeyed, 1);
});

test("promo filter covers Marvel Previews and Amazing World of DC Comics; parody filter is exact", () => {
  assert.equal(isExcludedTitle("Marvel Previews"), true);
  assert.equal(isExcludedTitle("The Amazing World of DC Comics"), true);
  assert.equal(isParodyTitle("Mad"), true);
  assert.equal(isParodyTitle("Mad Love"), false);
  assert.equal(isParodyTitle("Crazy Quilt"), false);
});
