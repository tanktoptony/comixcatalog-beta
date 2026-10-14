import test from "node:test";
import assert from "node:assert/strict";
import { feedbackRatingValue, formatSellerRating } from "./feedback.js";

test("maps feedback names to database ratings", () => {
  assert.equal(feedbackRatingValue("positive"), 1);
  assert.equal(feedbackRatingValue("neutral"), 0);
  assert.equal(feedbackRatingValue("negative"), -1);
  assert.equal(feedbackRatingValue("excellent"), null);
});

test("formats seller ratings and hides empty ratings", () => {
  assert.equal(formatSellerRating({ count: 54, percent_positive: 98 }), "98% positive (54)");
  assert.equal(formatSellerRating({ count: 0, percent_positive: null }), "");
});

test("feedback explanation uses no em dash", () => {
  const copy = "Your feedback stays hidden until both of you rate or 14 days pass.";
  assert.equal(copy.includes("\u2014"), false);
});
