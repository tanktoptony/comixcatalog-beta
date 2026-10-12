import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanUsername,
  escapeLike,
  followRateLimitDecision,
  isEitherDirectionBlocked,
  selfFollowError,
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
