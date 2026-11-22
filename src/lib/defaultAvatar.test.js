import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AVATAR_COUNT, avatarForProfile, avatarImageUrl, defaultAvatarFor } from "./defaultAvatar.js";

test("defaultAvatarFor is stable across calls", () => {
  assert.equal(defaultAvatarFor("user-42"), defaultAvatarFor("user-42"));
  assert.equal(defaultAvatarFor("CollectorName"), defaultAvatarFor("collectorname"));
});

test("defaultAvatarFor spreads a representative sample across all variants", () => {
  const avatars = new Set(Array.from({ length: 500 }, (_, i) => defaultAvatarFor(`collector-${i}`)));
  assert.equal(avatars.size, DEFAULT_AVATAR_COUNT);
});

test("avatarImageUrl serves uploaded avatars as stored, never through the paid resize", () => {
  // Image transforms are off (2026-11-21): a /render/image/ URL returns 403
  // FeatureNotEnabled, which blanked bartl3by's new avatar.
  const stored = "https://example.supabase.co/storage/v1/object/public/avatars/user/avatar.jpg?t=123";
  assert.equal(avatarImageUrl(stored, { width: 96, height: 80 }), stored);
  assert.doesNotMatch(avatarForProfile({ avatar_url: stored }, { width: 264, height: 264 }), /render\/image/);
  assert.equal(
    avatarImageUrl("https://example.supabase.co/storage/v1/render/image/public/avatars/user/avatar.jpg?t=123&width=96&height=96&resize=cover&quality=80"),
    stored
  );
});

test("avatarImageUrl leaves external and bundled avatars alone", () => {
  assert.equal(avatarImageUrl("https://images.example.com/avatar.png"), "https://images.example.com/avatar.png");
  assert.equal(avatarImageUrl("/avatars/default/cc_01.webp"), "/avatars/default/cc_01.webp");
  assert.equal(avatarImageUrl("/avatars/custom.png"), "/avatars/custom.png");
});
