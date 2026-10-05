import assert from "node:assert/strict";
import test from "node:test";
import {
  compactSeriesSearch,
  normalizeSeriesSearchWords,
  significantSeriesSearchWords,
  titleHasAllSearchWords,
  scoreSeriesSearchTitle,
} from "./seriesSearchMatch.js";

test("normalizes punctuation while retaining word boundaries", () => {
  assert.equal(normalizeSeriesSearchWords("  X-Men: The Series! "), "x men the series");
  assert.equal(compactSeriesSearch("Spider-Man"), "spiderman");
});

test("removes stopwords and one-character noise", () => {
  assert.deepEqual(significantSeriesSearchWords("The Street of A Fighter II"), [
    "street",
    "fighter",
    "ii",
  ]);
});

test("matches significant words in any order as whole words", () => {
  assert.equal(
    titleHasAllSearchWords("Street Fighter II: The Animated Movie Official", "animated street fighter ii"),
    true
  );
  assert.equal(titleHasAllSearchWords("Batman: The Animated Series", "bat man"), false);
});

test("typo fallback scores Cerebus but rejects unrelated titles", () => {
  assert.ok(scoreSeriesSearchTitle("Cerebus", "cerbus") > 0);
  assert.equal(scoreSeriesSearchTitle("Batman", "cerbus"), 0);
});
