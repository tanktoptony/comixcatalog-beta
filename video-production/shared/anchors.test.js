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

test("a glued word doesn't send the cursor to a later repeat of the phrase", () => {
  // The real case: the outro's "House of M" is a few hundred words later.
  const filler = Array.from({ length: 200 }, () => "blah").join(" ");
  const glued = `Number 5. House of M2005, Brian Michael Bendis. This is the book. ${filler} Later: House of M.`
    .split(" ").map((w, i) => ({ w, s: i, e: i + 0.5 }));
  const { times, misses } = resolveAnchors(glued, ["Number five", "House of M", "2005 Brian Michael Bendis", "This is the book"]);
  assert.equal(misses.length, 0);
  assert.deepEqual(times, [0, 2, 5, 8]);
});

import { applyEdit, insertGap } from "./narrationEdit.js";

test("applyEdit trims the lead-in, drops cut words and re-times the rest", () => {
  const t = { duration: 20, words: [
    { w: "silence", s: 1, e: 1.5 }, { w: "hello", s: 5, e: 5.5 }, { w: "flub", s: 8, e: 8.5 }, { w: "hello", s: 10, e: 10.5 }, { w: "end", s: 15, e: 15.5 },
  ] };
  const r = applyEdit(t, { start: 4, cuts: [[7, 9.5]] });
  assert.deepEqual(r.words.map((w) => [w.w, w.s]), [["hello", 1], ["hello", 3.5], ["end", 8.5]]);
  assert.equal(r.duration, 13.5);
  assert.deepEqual(r.clips, [{ from: 4, to: 7, out: 0 }, { from: 9.5, to: 20, out: 3 }]);
});

test("insertGap opens a hole for the spot and shifts what follows", () => {
  const clips = [{ from: 4, to: 7, out: 0 }, { from: 9.5, to: 20, out: 3 }];
  // Remove edited 5..8 (spans into the second clip) and insert a 10 s spot.
  assert.deepEqual(insertGap(clips, 5, 8, 10), [
    { from: 4, to: 7, out: 0 }, { from: 9.5, to: 11.5, out: 3 }, { from: 14.5, to: 20, out: 15 },
  ]);
});
