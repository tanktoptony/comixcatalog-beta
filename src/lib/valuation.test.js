// The bucket chain decides whether a book in someone's collection shows a
// real number or a cover-price guess, and the pooled percentile decides how
// big that number is on a book nobody graded. Both feed the insurance PDF.
//
// Run: npm run test:valuation

import test from "node:test";
import assert from "node:assert/strict";

import {
  gradeBucket,
  bucketFallbacks,
  percentile,
  median,
  isRawPool,
  RAW_POOL,
  RAW_POOL_BUCKETS,
  RAW_POOL_PERCENTILE,
} from "./valuation.js";

test("an ungraded book falls back to the pooled raw market", () => {
  // 627 of 670 owned books land here, because nobody sets a grade.
  assert.deepEqual(bucketFallbacks("Raw Ungraded"), ["Raw Ungraded", RAW_POOL]);
});

test("a book with a known raw grade never pools", () => {
  // The whole point of the asymmetry: we know this book is beaten up, so
  // pricing it off a pool that is mostly NM listings would be worse than
  // admitting we have no comps.
  assert.deepEqual(bucketFallbacks("Raw GD"), ["Raw GD"]);
  assert.deepEqual(bucketFallbacks("Raw NM"), ["Raw NM"]);
});

test("slabbed chains are untouched", () => {
  assert.deepEqual(bucketFallbacks("CGC 9.8"), ["CGC 9.8", "Slabbed 9.8"]);
  assert.deepEqual(bucketFallbacks("CBCS 9.6"), ["CBCS 9.6", "Slabbed 9.6"]);
  assert.deepEqual(bucketFallbacks("Slabbed 9.4"), ["Slabbed 9.4"]);
});

test("the pool never mixes slabbed comps in with raw ones", () => {
  // A slabbed 9.8 sells for a multiple of the same book raw. Pooling the two
  // would not be a fallback, it would be a fabrication.
  for (const b of RAW_POOL_BUCKETS) assert.match(b, /^Raw /);
  assert.equal(RAW_POOL_BUCKETS.includes("Raw Ungraded"), false);
});

test("the pool sentinel is not a real bucket any comp can carry", () => {
  // If this ever collided with a stored grade_bucket the `.in()` translation
  // would silently query the wrong thing.
  assert.equal(RAW_POOL_BUCKETS.includes(RAW_POOL), false);
  assert.equal(isRawPool(RAW_POOL), true);
  assert.equal(isRawPool("Raw NM"), false);
  assert.equal(isRawPool(gradeBucket({})), false);
});

test("an empty input still buckets as ungraded, so the chain applies", () => {
  assert.equal(gradeBucket({}), "Raw Ungraded");
  assert.deepEqual(bucketFallbacks(gradeBucket({})), ["Raw Ungraded", RAW_POOL]);
});

test("the pooled percentile sits below the median on a listing-skewed pool", () => {
  // Real shape of the comp table on 2026-09-24: far more NM/VF than GD.
  const pool = [5, 6, 8, 10, 12, 40, 45, 50, 55, 60];
  const p25 = percentile(pool, RAW_POOL_PERCENTILE);
  assert.ok(p25 < median(pool), `expected ${p25} < ${median(pool)}`);
});

test("percentile interpolates and hits the known landmarks", () => {
  const v = [10, 20, 30, 40];
  assert.equal(percentile(v, 0), 10);
  assert.equal(percentile(v, 1), 40);
  assert.equal(percentile(v, 0.5), 25);
  assert.equal(percentile(v, 0.25), 17.5);
});

test("percentile survives the degenerate inputs", () => {
  assert.equal(percentile([], 0.25), null);
  assert.equal(percentile([42], 0.25), 42);
  assert.equal(percentile([1, "x", null, 3], 0.5), 2);
});

test("percentile does not mutate the caller's array", () => {
  const original = [50, 10, 30];
  percentile(original, 0.25);
  assert.deepEqual(original, [50, 10, 30]);
});
