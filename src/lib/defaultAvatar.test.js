import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AVATAR_COUNT, defaultAvatarFor } from "./defaultAvatar.js";

test("defaultAvatarFor is stable across calls", () => {
  assert.equal(defaultAvatarFor("user-42"), defaultAvatarFor("user-42"));
  assert.equal(defaultAvatarFor("CollectorName"), defaultAvatarFor("collectorname"));
});

test("defaultAvatarFor spreads a representative sample across all variants", () => {
  const avatars = new Set(Array.from({ length: 500 }, (_, i) => defaultAvatarFor(`collector-${i}`)));
  assert.equal(avatars.size, DEFAULT_AVATAR_COUNT);
});
