import test from "node:test";
import assert from "node:assert/strict";
import { capStatus, coverScanConfigStatus, coverScanModelFailure, parseCoverExtraction, rankCoverCandidates } from "./coverScan.js";
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
