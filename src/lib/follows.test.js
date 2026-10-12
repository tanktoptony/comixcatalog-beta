import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanUsername,
  escapeLike,
  followRateLimitDecision,
  isEitherDirectionBlocked,
  rankSuggestedCollectors,
  selfFollowError,
  splitFollowBatchByLimit,
} from "./follows.js";

test("follow target input is trimmed and rejects non-strings", () => {
  assert.equal(cleanUsername("  tony  "), "tony");
  assert.equal(cleanUsername(null), "");
});

test("LIKE metacharacters are escaped", () => {
  assert.equal(escapeLike(String.raw`a%b_c\d`), String.raw`a\%b\_c\\d`);
});

test("new accounts have the stricter 24 hour follow limit", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  assert.deepEqual(
    followRateLimitDecision({ accountCreatedAt: "2026-10-12T00:00:00Z", recentFollows: 30, now }),
    { isNewAccount: true, limit: 30, allowed: false }
  );
  assert.equal(
    followRateLimitDecision({ accountCreatedAt: "2026-10-10T00:00:00Z", recentFollows: 199, now }).allowed,
    true
  );
});

test("a block in either direction refuses a follow", () => {
  assert.equal(isEitherDirectionBlocked(1), true);
  assert.equal(isEitherDirectionBlocked(0), false);
});

test("self-follow is rejected", () => {
  assert.equal(selfFollowError("same", "same"), "You can't follow yourself.");
  assert.equal(selfFollowError("one", "two"), null);
});

test("suggestions exclude the viewer, followed, blocked, private, and small collections", () => {
  const candidates = [
    { id: "founder", username: "z", owned_count: 12, is_public: true, is_founding_collector: true },
    { id: "large", username: "a", owned_count: 300, is_public: true },
    { id: "blocked", username: "b", owned_count: 500, is_public: true, is_founding_collector: true },
    { id: "followed", username: "c", owned_count: 400, is_public: true },
    { id: "viewer", username: "d", owned_count: 300, is_public: true },
    { id: "private", username: "e", owned_count: 300, is_public: false },
    { id: "small", username: "f", owned_count: 9, is_public: true },
  ];
  assert.deepEqual(
    rankSuggestedCollectors(candidates, {
      viewerId: "viewer",
      followedIds: ["followed"],
      blockedIds: ["blocked"],
    }).map(({ id }) => id),
    ["founder", "large"]
  );
});

test("a batch is split at the remaining daily follow allowance", () => {
  const result = splitFollowBatchByLimit({
    accountCreatedAt: "2026-10-10T00:00:00Z",
    recentFollows: 198,
    candidates: ["one", "two", "three"],
    now: Date.parse("2026-10-12T12:00:00Z"),
  });
  assert.deepEqual(result.accepted, ["one", "two"]);
  assert.deepEqual(result.rateLimited, ["three"]);
});
