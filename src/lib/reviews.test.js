import assert from "node:assert/strict";
import test from "node:test";
import { orderReviews, starsLabel, summarizeRatings, validateReviewInput } from "./reviews.js";

test("validation handles edges", () => {
  for (const rating of [0, 6, 2.5]) assert.ok(validateReviewInput({ issue: 1, rating }).error);
  assert.deepEqual(validateReviewInput({ issue: "3", rating: "3", body: "  hello\n\n\nworld  " }).value, { issueId: 3, rating: 3, body: "hello\n\nworld" });
  assert.equal(validateReviewInput({ issue: 1, rating: 5, body: "   " }).value.body, null);
  assert.equal(validateReviewInput({ issue: 1, rating: 5, body: "x".repeat(2001) }).error, "Reviews can be up to 2,000 characters.");
  assert.ok(validateReviewInput({ issue: 0, rating: 5 }).error);
});

test("summary rounds and handles empty input", () => {
  assert.deepEqual(summarizeRatings([1, 4, 5]), { count: 3, average: 3.3, histogram: [1, 0, 0, 1, 1] });
  assert.deepEqual(summarizeRatings([]), { count: 0, average: null, histogram: [0, 0, 0, 0, 0] });
});

test("ordering handles own, followed, blocked and rating-only reviews", () => {
  const reviews = [
    { id: "old", user_id: "other", body: "text", created_at: "2026-11-18" },
    { id: "mine", user_id: "me", body: null, created_at: "2026-11-17" },
    { id: "follow-no-body", user_id: "friend", body: null, created_at: "2026-11-20" },
    { id: "follow-body", user_id: "friend2", body: "yes", created_at: "2026-11-19" },
    { id: "blocked", user_id: "bad", body: "no", created_at: "2026-11-21" },
  ];
  assert.deepEqual(orderReviews(reviews, { viewerId: "me", followedIds: ["friend", "friend2"], blockedIds: ["bad"] }).map((r) => r.id), ["mine", "follow-body", "follow-no-body", "old"]);
  assert.equal(starsLabel(4), "4 out of 5 stars");
});
