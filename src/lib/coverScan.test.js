import test from "node:test";
import assert from "node:assert/strict";
import { COVER_SCAN_SCHEMA, COVER_TITLE_SIMILARITY_THRESHOLD, capStatus, collapseCoverPrintings, coverScanConfigStatus, coverScanModelFailure, coverScanOutcome, parseCoverExtraction, rankCoverCandidates, titleSimilarity } from "./coverScan.js";
import { extractCover } from "./coverScanClaude.js";
import { baseIssueNumber } from "./coverMatch.js";

const extracted = { series_title: "Street Fighter II", issue_number: "3", publisher: "Tokuma", cover_year: 1994, cover_month: 2, cover_price: "$2.95", edition_clues: [], other_text: "", is_comic_cover: true, confidence: "high" };
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
  assert.equal(capStatus(9, false).allowed, true); assert.equal(capStatus(10, false).allowed, false);
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
