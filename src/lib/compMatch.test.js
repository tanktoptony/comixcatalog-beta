// Comp matching decides which eBay listings count toward a book's value.
// Every title below is a real listing that was filed against the issue named
// in its test, taken from /u/legendofpayne and two other collections on
// 2026-10-04. Before the filter, X-Men #2 (1963) valued at $2.96 and
// Fantastic Four #12 (1963) at $4.00.
//
// Run: npm run test:comp-match

import test from "node:test";
import assert from "node:assert/strict";

import { compMatchesIssue, filterCompsForIssue, titleYears } from "./compMatch.js";
import { valueFromComps } from "./compValue.js";

const XMEN_1963 = { seriesTitle: "The X-Men", issueYear: 1963, seriesStartYear: 1963 };
const FF_1963 = { seriesTitle: "Fantastic Four", issueYear: 1963, seriesStartYear: 1961 };

function verdict(title, issue) {
  return compMatchesIssue({ title, ...issue });
}

const comp = (sold_price, grade_bucket, listing_title, grade_numeric = null) => ({
  sold_price,
  grade_bucket,
  grade_numeric,
  listing_title,
  sold_date: "2026-10-04",
  source: "ebay-listed",
});

test("drops a later volume named by year", () => {
  assert.equal(verdict('The Amazing X-Men #2 VF Marvel 1995 "THE AGE OF APOCALYPSE"', XMEN_1963).ok, false);
  assert.equal(verdict("UNCANNY X-MEN #2 CVR A 1ST APPEARANCE OF THE OUTLIERS NM 2024", XMEN_1963).ok, false);
  assert.equal(verdict("Fantastic Four #12 (1977) FN- 5.5", FF_1963).ok, false);
});

test("drops facsimiles, indexes and later printings", () => {
  assert.equal(verdict("FANTASTIC FOUR #12 NM, Facsimile Edition, Hulk, Lee/Kirby, Marvel Comics 2026", FF_1963).ok, false);
  assert.equal(verdict("OFFICIAL MARVEL INDEX TO THE X-MEN #2  MARVEL COMICS 1987 AL MILGROM VF-", XMEN_1963).ok, false);
  const absolute = { seriesTitle: "Absolute Batman", issueYear: 2025, seriesStartYear: 2024 };
  assert.equal(verdict("Absolute Batman #10 Cover A 2nd Print | DC Comics (2025) NM", absolute).ok, false);
  assert.equal(verdict("ABSOLUTE  BATMAN  #  1  CGC 9.0 (2024)  2 nd  PRINT COVER  A NICK  DRAGOTTA", absolute).ok, false);
});

test("keeps first printings", () => {
  const absolute = { seriesTitle: "Absolute Batman", issueYear: 2025, seriesStartYear: 2024 };
  assert.equal(verdict("Absolute Batman #10 1st Print NM 1st App Killer Croc Waylon Jones DC 2025", absolute).ok, true);
  assert.equal(verdict("Absolute Batman #10 Nick Dragotta Cover DC 2025 NM FIRST PRINT", absolute).ok, true);
});

test("drops signed, foreign, ratio and range listings", () => {
  const ab1 = { seriesTitle: "Absolute Batman", issueYear: 2024, seriesStartYear: 2024 };
  assert.equal(verdict("Absolute Batman #1 Signed Snyder Dragotta 2024 Sean Murphy NM", ab1).ok, false);
  assert.equal(verdict("Absolute Batman #1 Panini Comics Italian Edition CGC 9.6 Signed By Scott Snyder", ab1).ok, false);
  assert.equal(verdict("Absolute Batman 1 Fan Expo Jorge Jimenez Green Virgin Variant NM", ab1).ok, false);
  assert.equal(verdict("Absolute Batman #1-24 | Select Covers | DC Comics | NM 2025-26", ab1).ok, false);
  assert.equal(verdict("Marvel Doom #1 CGC 9.8 2nd Print 1:25 Virgin Cover", { seriesTitle: "Doom", issueYear: 2024 }).ok, false);
});

test("drops annuals and specials unless the series is one", () => {
  const asm = { seriesTitle: "The Amazing Spider-Man", issueYear: 1964, seriesStartYear: 1963 };
  assert.equal(verdict("The Amazing Spider-Man Annual #8 (Marvel Comics December 1971) VG", asm).ok, false);
  assert.equal(verdict("The Amazing Spider-Man King-Size Special #8 (Marvel Comics Dec 1971) POOR", asm).ok, false);
  assert.equal(verdict("Giant-Size X-Men #1 1975 CGC 6.0", { seriesTitle: "Giant-Size X-Men", issueYear: 1975 }).ok, true);
});

test("a qualifier before the series name means a different series unless the year confirms it", () => {
  // No year: "Uncanny" is a different series.
  assert.equal(verdict("Marvel Comics: The Uncanny X-Men #2: Fine/Very Fine Condition", XMEN_1963).ok, false);
  // Same words with the right year: sellers call the 1963 book Uncanny too.
  assert.equal(verdict("Uncanny X-Men #2 PR 0.5 RESTORED 1963", XMEN_1963).ok, true);
  // Spider-Man (1990) is not Amazing Spider-Man.
  const sm = { seriesTitle: "Spider-Man", issueYear: 1992, seriesStartYear: 1990 };
  assert.equal(verdict("Marvel Comics The Amazing SPIDER-MAN #27 Vol 2 Newsstand NM 9.4", sm).ok, false);
  assert.equal(verdict("SPIDER-MAN # 27 VF+ NEWSSTAND MARVEL COMICS 1992 GUN CONTROL ISSUE", sm).ok, true);
});

test("a different series that happens to share the number is dropped", () => {
  assert.equal(verdict("Silver Surfer #12 CGC 7.0 OW Pages 1970 Abomination App Buscema Marvel Key", FF_1963).ok, false);
});

test("cover-date shorthand counts as a year", () => {
  assert.deepEqual(titleYears("X-Men 94 CGC 6.5 O/W Pages 8/75 New X-Men Begin"), [1975]);
  assert.deepEqual(titleYears("X-Men #4 Marvel Comics 1/92 CGC Graded 9.6"), [1992]);
  assert.deepEqual(titleYears("CGC 9.8/10 white pages"), []);
  assert.equal(verdict("X-Men #4 Marvel Comics 1/92 CGC Graded 9.6", { ...XMEN_1963, issueYear: 1964 }).ok, false);
});

test("the series start year is not a mismatch", () => {
  const x94 = { seriesTitle: "The X-Men", issueYear: 1975, seriesStartYear: 1963 };
  assert.equal(verdict("X-Men #94 FN- 1st App of The New X-Men Team In The X-Men Marvel 1963 Series", x94).ok, true);
});

test("vintage anchor drops no-year junk priced far below year-confirmed copies", () => {
  const asm10 = { seriesTitle: "The Amazing Spider-Man", issueYear: 1964, seriesStartYear: 1963 };
  const kept = filterCompsForIssue(
    [
      comp(4.5, "Raw VF", "21521: MARVEL THE AMAZING SPIDER-MAN #10 VF Grade"),
      comp(4.5, "Raw Ungraded", "The Amazing Spider-Man #10 (VF/NM)"),
      comp(283.89, "Raw GD", "The Amazing Spider-Man #10 – Marvel (1964) 2.0 GD Jack Kirby cover | Stan Lee..."),
    ],
    asm10
  );
  assert.deepEqual(kept.map((c) => c.sold_price), [283.89]);
});

test("no series title means no filtering", () => {
  const rows = [comp(3, "Raw NM", "anything at all")];
  assert.equal(filterCompsForIssue(rows, {}).length, 1);
});

// The two books that started this. Real comp pools, trimmed.
const FF12_COMPS = [
  comp(3, "Raw FN", "Fantastic Four #12 (1977) FN- 5.5"),
  comp(4, "Raw FN", "Fantastic Four #12 - CVR A (FN)"),
  comp(5.99, "Raw NM", "FANTASTIC FOUR #12 NM, Facsimile Edition, Hulk, Lee/Kirby, Marvel Comics 2026"),
  comp(129.99, "CGC 7.0", "Silver Surfer #12 CGC 7.0 OW Pages 1970 Abomination App Buscema Marvel Key", 7.0),
  comp(299, "Raw PR", "FANTASTIC FOUR #12  1st Incredible Hulk Crossover 1963 0.5 POOR INCOMPLETE"),
  comp(524.99, "CGC 2.0", "Fantastic Four #12 - 1963 - CGC 1.8 - First Hulk vs Thing", 2.0),
  comp(660, "CGC 2.5", "Fantastic Four #12 CGC 2.5 1963 2084619002", 2.5),
  comp(814, "Raw VG", "Fantastic Four #12 VG- 3.5  1st Hulk vs Thing Battle! Jack Kirby Art! Marvel"),
  comp(950, "CGC 3.5", "Fantastic Four 12 CGC 3.5 1963 Marvel Stan Lee Jack Kirby 1st Meeting With Hulk", 3.5),
  comp(2975, "CGC 6.0", "FANTASTIC FOUR #12 CGC 6.0 (1963)", 6.0),
];

test("an ungraded FF #12 (1963) is valued off real copies, not $4", () => {
  const result = valueFromComps({ comps: FF12_COMPS, item: {}, issue: FF_1963 });
  assert.ok(result.value > 300, `expected a Silver Age price, got ${result.value}`);
  assert.equal(result.condition_unknown, true);
});

test("a graded copy uses its own bucket from the filtered comps", () => {
  const result = valueFromComps({
    comps: FF12_COMPS,
    item: { grade_numeric: 2.5, slab_company: "CGC" },
    issue: FF_1963,
    minSamples: 1,
  });
  assert.equal(result.value, 660);
});

test("too few clean comps before 1990 shows no value, not a 1960s cover price", () => {
  const xmen2 = [
    comp(2.1, "Raw VF", 'The Amazing X-Men #2 VF Marvel 1995 "THE AGE OF APOCALYPSE"'),
    comp(2.61, "Raw VF", "OFFICIAL MARVEL INDEX TO THE X-MEN #2  MARVEL COMICS 1987 AL MILGROM VF-"),
    comp(3.99, "Raw NM", "UNCANNY X-MEN #2 CVR A 1ST APPEARANCE OF THE OUTLIERS NM 2024"),
    comp(4, "Raw FN", "Marvel Comics: The Uncanny X-Men #2: Fine/Very Fine Condition"),
  ];
  const result = valueFromComps({ comps: xmen2, item: {}, issue: XMEN_1963 });
  assert.equal(result.value, null);
});

test("from 1990 on, the cover-price floor still applies", () => {
  const result = valueFromComps({ comps: [], item: {}, issue: { seriesTitle: "Spider-Man", issueYear: 1992 } });
  assert.equal(result.source, "cover-price");
  assert.equal(result.value, 1.5);
});

// Round two, 2026-10-05, after the first refresh with the new filter.
const SECRET_WARS = { seriesTitle: "Marvel Super-Heroes Secret Wars", issueYear: 1984, seriesStartYear: 1984 };

test("a shortened long title matches when the year confirms it", () => {
  assert.equal(compMatchesIssue({ title: "Secret Wars #8 1984 1st Black Costume CGC 9.4", ...SECRET_WARS }).ok, true);
  assert.equal(compMatchesIssue({ title: "Marvel Secret Wars #8 (1984) VF/NM", ...SECRET_WARS }).ok, true);
});

test("a shortened title without a year, or with a qualifier, still fails", () => {
  assert.equal(compMatchesIssue({ title: "Secret Wars #8 NM", ...SECRET_WARS }).ok, false);
  assert.equal(compMatchesIssue({ title: "Secret Wars #8 2015 Esad Ribic NM", ...SECRET_WARS }).ok, false);
  const asm = { seriesTitle: "The Amazing Spider-Man", issueYear: 1985, seriesStartYear: 1963 };
  assert.equal(compMatchesIssue({ title: "Web of Spider-Man #1 1985 VF", ...asm }).ok, false);
});

test("manga is not the comic", () => {
  const sw = { seriesTitle: "Star Wars", issueYear: 1977, seriesStartYear: 1977 };
  assert.equal(compMatchesIssue({ title: "Star Wars Lost Stars, Vol 1 (manga) (Star Wars Lost Stars (manga)) - GOOD", ...sw }).ok, false);
});

test("an ungraded book with only higher-grade slabs falls back to all clean comps", () => {
  const sw = { seriesTitle: "Star Wars", issueYear: 1977, seriesStartYear: 1977 };
  const comps = [
    comp(4.5, "Raw VF", "29055: MARVEL STAR WARS #1 VF Grade"),
    comp(240, "CGC 6.5", "STAR WARS #1 ~ Original 1st printing 1977 Marvel Comics ~ CGC 6.5 WHITE pages", 6.5),
    comp(295.95, "Raw VF", "STAR WARS #1 (Marvel/1977) *1st Print! Key!* (VF) Super Bright & Glossy!"),
    comp(299.95, "CGC 8.0", "Star Wars 1 CGC 8.0 VF white pages Marvel comics 4751860019", 8.0),
    comp(334, "Raw VF", "Star Wars #1 VF+ 8.5 1st App Luke Skywalker Darth Vader! Marvel 1977"),
    comp(650, "CGC 9.4", "Star Wars #1 CGC 9.4 WHITE Pages – 1977 Marvel Comics", 9.4),
  ];
  const result = valueFromComps({ comps, item: {}, issue: sw });
  assert.ok(result.value > 200 && result.value < 400, `got ${result.value}`);
});

test("a modern book does not borrow slab prices for an ungraded copy", () => {
  const saga = { seriesTitle: "Saga", issueYear: 2012, seriesStartYear: 2012 };
  const comps = [
    comp(450, "CGC 9.8", "Saga #1 CGC 9.8 2012 Image 1st Print", 9.8),
    comp(475, "CGC 9.8", "Saga #1 CGC 9.8 White Pages 2012", 9.8),
    comp(180, "CGC 9.4", "Saga #1 CGC 9.4 2012 First Print", 9.4),
  ];
  const result = valueFromComps({ comps, item: {}, issue: saga });
  assert.equal(result.source, "cover-price");
});
