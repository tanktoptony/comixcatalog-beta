import test from "node:test";
import assert from "node:assert/strict";
import { COVER_SCAN_SCHEMA, COVER_TITLE_SIMILARITY_THRESHOLD, capStatus, FREE_NOT_IN_CATALOG, scanUsage, scanWasFree, collapseCoverPrintings, coverScanConfigStatus, coverScanModelFailure, coverScanOutcome, ownedCopiesFor, ownedCopyLabel, parseCoverExtraction, rankCoverCandidates, assertedClueWords, scanResultHasIssue, titleSimilarity, versionClueMatch } from "./coverScan.js";
import { extractCover } from "./coverScanClaude.js";
import { baseIssueNumber } from "./coverMatch.js";

const extracted = { series_title: "Street Fighter II", issue_number: "3", publisher: "Tokuma", cover_year: 1994, cover_month: 2, cover_price: "$2.95", edition_clues: [], other_text: "", is_comic_cover: true, confidence: "high" };
const collectionRow = (overrides = {}) => ({ id: "one", gcd_issue_id: 10, status: "owned", copy_number: 1, variant_label: null, ...overrides });
test("owned copies ignores absent issues and wishlist rows", () => {
  assert.deepEqual(ownedCopiesFor([], 10), []);
  assert.deepEqual(ownedCopiesFor([collectionRow({ status: "wishlist" })], 10), []);
});
test("owned copies returns one owned copy", () => assert.deepEqual(ownedCopiesFor([collectionRow()], 10), [{ id: "one", copy_number: 1, variant_label: null }]));
test("owned copies sorts copies and labels variants", () => {
  const copies = ownedCopiesFor([collectionRow({ id: "two", copy_number: 2, variant_label: "Newsstand" }), collectionRow()], 10);
  assert.deepEqual(copies.map((copy) => copy.id), ["one", "two"]);
  assert.equal(ownedCopyLabel(copies[1]), "Copy 2 (Newsstand)");
});
test("for-sale copies count as owned", () => assert.equal(ownedCopiesFor([collectionRow({ status: "for_sale" })], 10).length, 1));
test("structured cover output parses", () => assert.deepEqual(parseCoverExtraction({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(extracted) }] }), extracted));
test("refusal and truncation are rejected before content", () => {
  assert.throws(() => parseCoverExtraction({ stop_reason: "refusal", content: [] }), /safely/);
  assert.throws(() => parseCoverExtraction({ stop_reason: "max_tokens", content: [] }), /incomplete/);
  assert.deepEqual(coverScanModelFailure(), {
    status: 502,
    outcome: "error",
    error: "We could not read that cover. Please try another photo.",
  });
});
test("base issue matching accepts edition suffixes and ranks year and publisher", () => {
  assert.equal(baseIssueNumber("1 [Newsstand]"), "1");
  const series = [
    { gcd_id: 1, title: "Street Fighter II", year_start_cached: 1994, year_end_cached: 1995, resolved_publisher_cached: "Tokuma" },
    { gcd_id: 2, title: "Street Fighter II", year_start_cached: 2005, year_end_cached: 2008, resolved_publisher_cached: "Udon" },
    { gcd_id: 3, title: "Street Fighter II", year_start_cached: 1995, year_end_cached: 1996, resolved_publisher_cached: "Viz" },
  ];
  const issues = [{ gcd_id: 11, series_gcd_id: 1, issue_number: "3 [Newsstand]", key_date: "1994-02" }, { gcd_id: 22, series_gcd_id: 2, issue_number: "3", key_date: "2005-01" }, { gcd_id: 33, series_gcd_id: 3, issue_number: "3", key_date: "1995-01" }];
  assert.equal(rankCoverCandidates(extracted, series, issues)[0].issue.gcd_id, 11);
});
test("title similarity ignores order, punctuation, case, and leading The", () => {
  assert.equal(titleSimilarity("Batman: Immortal Legend", "Immortal Legend Batman"), 1);
  assert.ok(titleSimilarity("Batman: Immortal Legend", "Batman: Urban Legends") < COVER_TITLE_SIMILARITY_THRESHOLD);
  assert.equal(titleSimilarity("The Squidder", "Squidder"), 1);
});
test("candidates below the title threshold produce no catalog match", () => {
  const series = [{ gcd_id: 1, title: "Batman: Urban Legends", year_start_cached: 2021, year_end_cached: 2023, resolved_publisher_cached: "DC Comics" }];
  const issues = [{ gcd_id: 10, series_gcd_id: 1, issue_number: "2", key_date: "2021-04" }];
  const input = { ...extracted, series_title: "Batman: Immortal Legend", issue_number: "2", publisher: "DC Comics", cover_year: 2021 };
  const candidates = rankCoverCandidates(input, series, issues);
  assert.deepEqual(candidates, []);
  assert.equal(coverScanOutcome(input, candidates), "not_in_catalog");
});
test("printings collapse to one issue and prefer a covered printing", () => {
  const series = [{ gcd_id: 81844, title: "The Squidder", year_start_cached: 2014, year_end_cached: 2014, resolved_publisher_cached: "IDW" }];
  const issues = [1243255, 1244016, 1246770].map((gcd_id, index) => ({ gcd_id, series_gcd_id: 81844, issue_number: index ? `1 [${index + 1}nd printing]` : "1", key_date: "2014-07" }));
  const input = { ...extracted, series_title: "Squidder", issue_number: "1", publisher: "IDW Publishing / 44Flood", cover_year: 2014 };
  const ranked = rankCoverCandidates(input, series, issues);
  assert.equal(collapseCoverPrintings(ranked).length, 1);
  assert.equal(collapseCoverPrintings(ranked)[0].issue.gcd_id, 1243255);
  const covers = new Map([[1244016, { storage_path: "squidder.jpg" }]]);
  assert.equal(collapseCoverPrintings(ranked, covers)[0].issue.gcd_id, 1244016);
});
test("printings collapse keeps the highest-ranked covered edition", () => {
  const series = [{ gcd_id: 81844, title: "The Squidder", year_start_cached: 2014, year_end_cached: 2014, resolved_publisher_cached: "IDW" }];
  const issues = [
    { gcd_id: 100, series_gcd_id: 81844, issue_number: "1", key_date: "2014-07" },
    { gcd_id: 200, series_gcd_id: 81844, issue_number: "1 [2nd printing]", key_date: "2014-07" },
  ];
  const input = { ...extracted, series_title: "Squidder", issue_number: "1", publisher: "IDW", cover_year: 2014, edition_clues: ["2nd printing"] };
  const ranked = rankCoverCandidates(input, series, issues);
  const covers = new Map([
    [100, { storage_path: "squidder-first.jpg" }],
    [200, { storage_path: "squidder-second.jpg" }],
  ]);
  assert.equal(ranked[0].issue.gcd_id, 200);
  assert.equal(collapseCoverPrintings(ranked, covers)[0].issue.gcd_id, 200);
});
test("Cerebus 1977 number one ranks first", () => {
  const input = { ...extracted, series_title: "Cerebus", issue_number: "1", publisher: "", cover_year: 1977 };
  const series = [{ gcd_id: 1, title: "Cerebus", year_start_cached: 1977, year_end_cached: 2004, resolved_publisher_cached: "Aardvark-Vanaheim" }, { gcd_id: 2, title: "Cerebus", year_start_cached: 2019, year_end_cached: 2019, resolved_publisher_cached: "Aardvark-Vanaheim" }];
  const issues = [{ gcd_id: 10, series_gcd_id: 1, issue_number: "1", key_date: "1977-12" }, { gcd_id: 20, series_gcd_id: 2, issue_number: "1", key_date: "2019-01" }];
  assert.equal(rankCoverCandidates(input, series, issues)[0].issue.gcd_id, 10);
});
test("daily limits allow the last scan and reject the next", () => {
  assert.equal(capStatus(99, false).allowed, true); assert.equal(capStatus(100, false).allowed, false);
  assert.equal(capStatus(99, true).allowed, true); assert.equal(capStatus(100, true).allowed, false);
});
test("missing API key fails cleanly without a model call", async () => {
  assert.deepEqual(coverScanConfigStatus({}), { status: 503, error: "Cover scanning is temporarily unavailable." });
  const old = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(extractCover("abc"), (error) => error.status === 503);
  if (old) process.env.ANTHROPIC_API_KEY = old;
});

test("schema has no integer bounds the API rejects; parser clamps instead", () => {
  const json = JSON.stringify(COVER_SCAN_SCHEMA);
  assert.equal(/"(minimum|maximum)"/.test(json), false);
  const msg = (v) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(v) }] });
  const base = { series_title: "X-Men", issue_number: "20", publisher: "Marvel", cover_year: 1993, cover_month: 5, cover_price: "$1.25", edition_clues: [], other_text: "", is_comic_cover: true, confidence: "high" };
  assert.equal(parseCoverExtraction(msg({ ...base, cover_month: 13 })).cover_month, null);
  assert.equal(parseCoverExtraction(msg({ ...base, cover_year: 199 })).cover_year, null);
  assert.equal(parseCoverExtraction(msg(base)).cover_month, 5);
});

test("scans of books we don't have are free up to the daily ceiling", () => {
  assert.equal(scanUsage(10, 0), 10);
  assert.equal(scanUsage(10, FREE_NOT_IN_CATALOG), 10);
  assert.equal(scanUsage(10, FREE_NOT_IN_CATALOG + 5), 15);
  assert.equal(scanWasFree("not_in_catalog", 0), true);
  assert.equal(scanWasFree("not_in_catalog", FREE_NOT_IN_CATALOG - 1), true);
  assert.equal(scanWasFree("not_in_catalog", FREE_NOT_IN_CATALOG), false);
  assert.equal(scanWasFree("matched", 0), false);
  assert.equal(scanWasFree("not_a_comic", 0), false);
});
test("free not-in-catalog scans never unlock past the cap", () => {
  assert.equal(capStatus(scanUsage(100, FREE_NOT_IN_CATALOG), false).allowed, false);
  assert.equal(capStatus(scanUsage(99, FREE_NOT_IN_CATALOG + 1), false).allowed, false);
});

// Live case 2026-11-20: a slabbed Mark Brooks virgin of Hulk: Smash Everything
// #1 matched the regular edition, though GCD lists the virgin as its own version.
const hulkSeries = [{ gcd_id: 230115, title: "Hulk: Smash Everything", year_start_cached: 2026, year_end_cached: 2026, resolved_publisher_cached: "Marvel" }];
const hulkIssues = [
  [2791431, null], [2792288, "Luciano Vecchio Cover"], [2792403, "Mark Brooks Cover"],
  [2792404, "Paulo Siqueira Cover"], [2793021, "Adi Granov Foil Cover"], [2793022, "Mark Brooks Virgin Cover"],
].map(([gcd_id, variant_name]) => ({ gcd_id, series_gcd_id: 230115, issue_number: "1", publication_date: "February 2026", variant_name, base_gcd_issue_id: 2791431 }));
const hulkScan = (edition_clues, other_text = "") => ({ ...extracted, series_title: "Hulk Smash Everything", issue_number: "1", publisher: "Marvel", cover_year: null, edition_clues, other_text });
const hulkPick = (scan, covers) => collapseCoverPrintings(rankCoverCandidates(scan, hulkSeries, hulkIssues), covers, scan)[0];

test("cover clues pick the virgin variant they name", () => {
  const pick = hulkPick(hulkScan(["Virgin variant cover (no trade dress, logo, or price visible)", "Artist signature chop for Mark Brooks visible at lower left", "Encased in a graded slab; label not visible"]));
  assert.equal(pick.issue.gcd_id, 2793022);
  assert.equal(pick.versionPicked, true);
});
test("an artist clue without 'virgin' picks the trade-dress cover", () => {
  assert.equal(hulkPick(hulkScan(["Mark Brooks cover art"])).issue.gcd_id, 2792403);
});
test("no clue keeps the regular edition, even when a variant has a cover", () => {
  const pick = hulkPick(hulkScan([]), new Map([[2792288, { storage_path: "x.jpg", source: "gcd_issue_id" }]]));
  assert.equal(pick.issue.gcd_id, 2791431);
  assert.equal(pick.versionPicked, false);
});
test("every version stays on the result, regular first", () => {
  const pick = hulkPick(hulkScan([]));
  assert.equal(pick.versions.length, 6);
  assert.deepEqual(pick.versions[0], { gcd_issue_id: 2791431, name: "Regular edition" });
  assert.ok(pick.versions.some((version) => version.name === "Mark Brooks Virgin Cover"));
});
test("two versions that fit equally well pick neither", () => {
  const issues = [...hulkIssues, { ...hulkIssues[2], gcd_id: 2799999, variant_name: "Brooks Mark Cover" }];
  const scan = hulkScan(["Mark Brooks cover"]);
  assert.equal(collapseCoverPrintings(rankCoverCandidates(scan, hulkSeries, issues), new Map(), scan)[0].issue.gcd_id, 2791431);
});
test("version clues read ordinals both ways", () => {
  assert.equal(versionClueMatch("Second Printing", { edition_clues: ["2nd printing"] }), 2);
  assert.equal(versionClueMatch("2nd Printing Variant", { edition_clues: ["second printing"] }), 2);
  assert.equal(versionClueMatch("Mark Brooks Virgin Cover", { edition_clues: ["Mark Brooks"] }), 0);
});
test("a scan result accepts its issue or any listed version, nothing else", () => {
  const candidates = [{ gcd_issue_id: 2791431, versions: [{ gcd_issue_id: 2791431 }, { gcd_issue_id: 2793022 }] }];
  assert.equal(scanResultHasIssue(candidates, 2793022), true);
  assert.equal(scanResultHasIssue(candidates, "2791431"), true);
  assert.equal(scanResultHasIssue(candidates, 44451), false);
  assert.equal(scanResultHasIssue([{ gcd_issue_id: 5 }], 5), true);
});
test("hedged or two-sided edition clues never pick a version", () => {
  // Real read-outs from past scans.
  const words = (clues) => assertedClueWords({ edition_clues: clues, other_text: "" });
  assert.equal(words(["$1.25 US / $1.50 CAN / UK 70p price box (direct/newsstand not determinable; no barcode visible)"]).has("newsstand"), false);
  assert.equal(words(["Barcode in lower left corner suggests newsstand edition"]).has("newsstand"), false);
  assert.equal(words(["Direct/newsstand: Spider-Man corner box"]).has("newsstand"), false);
  assert.equal(words(["UPC barcode on front cover (newsstand edition)", "'Direct Edition' printed in corner box"]).has("newsstand"), false);
  assert.equal(words(["Barcode in corner box (newsstand edition)"]).has("newsstand"), true);
  assert.equal(words(["Virgin variant cover (no trade dress, logo, or price visible)"]).has("virgin"), true);
  assert.equal(versionClueMatch("Newsstand", { edition_clues: ["Price box (direct/newsstand not distinguishable; no UPC visible)"] }), 0);
});
test("a printed Canadian price is not the Canadian price variant", () => {
  // Real read-outs: 29e5b1a2 and ee02a428 landed on "Canadian" before this rule.
  assert.equal(versionClueMatch("Canadian", { edition_clues: ["Canadian price $1.00 and U.K. 40p also printed in corner box"] }), 0);
  assert.equal(versionClueMatch("UK Price Variant", { edition_clues: ["$1.25 US / UK 60p price box"] }), 0);
  assert.equal(versionClueMatch("Canadian", { edition_clues: ["Canadian price variant (95¢ CAN only)"] }), 1);
  assert.equal(versionClueMatch("Newsstand", { edition_clues: ["Barcode in UPC box, suggesting newsstand edition"] }), 0);
});
test("an artist the model only guesses at never picks that artist's variant", () => {
  // Live scan 2026-11-21 of the main cover (add-on 00111, cover A) read
  // "Signature on cover appears to be Mark Brooks" and landed on his variant.
  const clues = ["Barcode add-on 00111 suggests issue 1, cover A (first printing)", "Signature on cover appears to be Mark Brooks (signed artwork on right side)", "Standard trade dress cover with title, logo and credits — not a virgin, foil, or sketch variant", "Rated T+"];
  assert.equal(hulkPick(hulkScan(clues)).issue.gcd_id, 2791431);
  assert.equal(hulkPick(hulkScan(["Artist signature chop for Mark Brooks visible at lower left", "Virgin variant cover"])).issue.gcd_id, 2793022);
});
