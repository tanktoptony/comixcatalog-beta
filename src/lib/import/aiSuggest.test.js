import test from "node:test";
import assert from "node:assert/strict";
import { buildSuggestPrompt, outcomeFor, parseSuggestions, promptRows, proposalRow, suggestionResult } from "./aiSuggest.js";
import { missRecord } from "./importMisses.js";
import { titleSpellings } from "./import.js";

test("crossover titles are tried with versus and vs. both ways", () => {
  const spellings = titleSpellings("Fantastic Four Versus The X-Men");
  assert.ok(spellings.includes("Fantastic Four vs. X-Men"));
  assert.ok(spellings.includes("Fantastic Four versus the X-Men"));
  assert.deepEqual(titleSpellings("Saga"), ["Saga"]);
  // "vs" inside a word is left alone.
  assert.deepEqual(titleSpellings("Canvas Daredevils"), ["Canvas Daredevils"]);
});

const message = (rows, stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "text", text: JSON.stringify({ rows }) }] });

test("only the columns that name a book go to the model", () => {
  const [row] = promptRows([{ i: 3, series: "X-Men  Vol. 2", issue: "30", publisher: "Marvel", grade: "9.8", price_paid: "40", cert: "123", notes: "my favorite", issue_year: 1994 }]);
  assert.deepEqual(row, { i: 3, series: "X-Men Vol. 2", issue: "30", publisher: "Marvel", year: "1994" });
  const prompt = buildSuggestPrompt([{ i: 3, series: "ASM", issue: "300", cert: "4021337001" }]);
  assert.match(prompt, /"series":"ASM"/);
  assert.doesNotMatch(prompt, /4021337001/);
});

test("refusals and cut-off responses are errors, not empty suggestions", () => {
  assert.throws(() => parseSuggestions(message([], "refusal"), [1]), /declined/);
  assert.throws(() => parseSuggestions(message([], "max_tokens"), [1]), /incomplete/);
  assert.throws(() => parseSuggestions({ stop_reason: "end_turn", content: [] }, [1]), /empty/);
});

test("suggestions for rows we didn't send, or sent twice, are ignored", () => {
  const byId = parseSuggestions(message([
    { i: 1, series_title: "X-Men", series_start_year: 1991, issue_number: "30", publisher: "Marvel", confidence: "medium" },
    { i: 1, series_title: "Wrong", series_start_year: 2000, issue_number: "1", publisher: "DC", confidence: "high" },
    { i: 99, series_title: "Injected", series_start_year: 2000, issue_number: "1", publisher: "DC", confidence: "high" },
  ]), [1, 2]);
  assert.equal(byId.size, 1);
  assert.equal(byId.get(1).series_title, "X-Men");
});

test("weak suggestions are not tried against the catalog", () => {
  const original = { i: 4, series: "Spidey thing", issue: "2", publisher: "Marvel", issue_year: 1999 };
  assert.equal(proposalRow(original, { series_title: "Spidey Super Stories", series_start_year: 1974, issue_number: "2", confidence: "low" }), null);
  assert.equal(proposalRow(original, { series_title: null, series_start_year: null, issue_number: "2", confidence: "high" }), null);
  assert.equal(proposalRow(original, { series_title: "Spidey", series_start_year: null, issue_number: " ", confidence: "high" }), null);
});

test("a usable suggestion becomes a matcher row with a sane year", () => {
  const original = { i: 4, series: "X-Men Vol. 2", issue: "30", publisher: "Marvel Comics", issue_year: 1994 };
  assert.deepEqual(proposalRow(original, { series_title: "X-Men", series_start_year: 1991, issue_number: "30", publisher: null, confidence: "medium" }),
    { i: 4, series: "X-Men", issue: "30", publisher: "Marvel Comics", series_year: 1991, issue_year: 1994 });
  assert.equal(proposalRow(original, { series_title: "X-Men", series_start_year: 19910, issue_number: "30", publisher: "Marvel", confidence: "high" }).series_year, undefined);
});

test("only a book the catalog matcher found becomes a suggestion", () => {
  const original = { i: 7, series: "Uncanny X-Men", issue: "302" };
  const matched = suggestionResult(original, { i: 7, result: "matched", gcd_issue_id: 55, series_gcd_id: 9, label: "The Uncanny X-Men (1963) #302" }, { confidence: "medium" });
  assert.equal(matched.result, "suggested");
  assert.equal(matched.gcd_issue_id, 55);
  assert.equal(matched.from, "Uncanny X-Men #302");
  assert.equal(outcomeFor(matched), "ai_suggested");

  // The model proposed something the catalog doesn't have: still not found.
  const missing = suggestionResult(original, { i: 7, result: "not_found", reason: "nope" }, { confidence: "high" });
  assert.equal(missing.result, "not_found");
  assert.equal(missing.gcd_issue_id, undefined);
  assert.equal(outcomeFor(missing), "ai_no_match");
  // No proposal at all (weak suggestion): also not found.
  assert.equal(suggestionResult(original, undefined, undefined).result, "not_found");

  const pick = suggestionResult(original, { i: 7, result: "pick", reason: "2 volumes", candidates: [{ series_gcd_id: 1 }, { series_gcd_id: 2 }] }, {});
  assert.equal(pick.result, "pick");
  assert.equal(pick.candidates.length, 2);
  assert.equal(outcomeFor(pick), "ai_pick");
});

test("miss records clip the collector's text and keep only a numeric issue id", () => {
  const record = missRecord("u1", { row: { series: "x".repeat(500), issue: "1", issue_year: 1994 }, outcome: "not_found", gcdIssueId: "123" });
  assert.equal(record.series.length, 200);
  assert.equal(record.year, "1994");
  assert.equal(record.gcd_issue_id, 123);
  assert.equal(missRecord("u1", { row: {}, outcome: "ai_error" }).gcd_issue_id, null);
});
