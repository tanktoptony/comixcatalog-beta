import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAnchors, tokenize } from "./anchors.js";

const words = "So that's what this video is. Not a reading order. Number 3. Excutioners Song. X -Men number 1, Stanley and Jack Kirby."
  .split(" ")
  .map((w, i) => ({ w, s: i, e: i + 0.5 }));

test("tokenize folds number words and punctuation", () => {
  assert.deepEqual(tokenize("Number three. X-Men #1!"), ["number", "3", "x", "men", "1"]);
});

test("finds phrases in order, tolerating transcription drift", () => {
  const { times, misses } = resolveAnchors(words, ["So that's what this video is", "Number three", "X-Men #1", "and Jack Kirby"]);
  assert.equal(misses.length, 0);
  assert.deepEqual(times, [0, 10, 14, 19]);
});

test("reports misses and spreads them between neighbours instead of guessing", () => {
  const { times, misses } = resolveAnchors(words, ["So that's what", "Galactus eats a planet", "Silver Surfer arrives", "Number three"]);
  assert.deepEqual(misses.map((m) => m.index), [1, 2]);
  assert.ok(times[0] < times[1] && times[1] < times[2] && times[2] < times[3]);
});
