import test from "node:test";
import assert from "node:assert/strict";
import { followerIsNew, inboxAriaLabel, inboxBadgeTotal } from "./inboxNotifications.js";

test("badge total combines messages, followers, and pending purchases", () => {
  assert.equal(inboxBadgeTotal({ messages: 2, followers: 3, purchases: 1 }), 6);
  assert.equal(inboxAriaLabel({ messages: 2, followers: 1, purchases: 1 }), "Inbox (2 unread messages, 1 new follower, 1 pending purchase)");
});

test("followers at or before the seen cutoff are not new", () => {
  const followersSeenAt = "2026-10-12T12:00:00Z";
  assert.equal(followerIsNew({ followedAt: "2026-10-12T11:59:59Z", followersSeenAt, accountCreatedAt: "2026-01-01T00:00:00Z" }), false);
  assert.equal(followerIsNew({ followedAt: followersSeenAt, followersSeenAt, accountCreatedAt: "2026-01-01T00:00:00Z" }), false);
  assert.equal(followerIsNew({ followedAt: "2026-10-12T12:00:01Z", followersSeenAt, accountCreatedAt: "2026-01-01T00:00:00Z" }), true);
});

test("account creation is the cutoff before followers have been seen", () => {
  assert.equal(followerIsNew({ followedAt: "2026-10-12T12:00:01Z", followersSeenAt: null, accountCreatedAt: "2026-10-12T12:00:00Z" }), true);
});
