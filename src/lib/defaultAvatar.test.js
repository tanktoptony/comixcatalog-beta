import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AVATAR_COUNT, avatarImageUrl, defaultAvatarFor } from "./defaultAvatar.js";

test("defaultAvatarFor is stable across calls", () => {
  assert.equal(defaultAvatarFor("user-42"), defaultAvatarFor("user-42"));
  assert.equal(defaultAvatarFor("CollectorName"), defaultAvatarFor("collectorname"));
});

test("defaultAvatarFor spreads a representative sample across all variants", () => {
  const avatars = new Set(Array.from({ length: 500 }, (_, i) => defaultAvatarFor(`collector-${i}`)));
  assert.equal(avatars.size, DEFAULT_AVATAR_COUNT);
});

test("avatarImageUrl rewrites public avatar storage URLs to sized transforms", () => {
  assert.equal(
    avatarImageUrl("https://example.supabase.co/storage/v1/object/public/avatars/user/avatar.png?t=123", { width: 96, height: 80 }),
    "https://example.supabase.co/storage/v1/render/image/public/avatars/user/avatar.png?t=123&width=96&height=80&resize=cover&quality=80"
  );
});

test("avatarImageUrl leaves external and bundled avatars alone", () => {
  assert.equal(avatarImageUrl("https://images.example.com/avatar.png"), "https://images.example.com/avatar.png");
  assert.equal(avatarImageUrl("/avatars/default/cc_01.webp"), "/avatars/default/cc_01.webp");
  assert.equal(avatarImageUrl("/avatars/custom.png"), "/avatars/custom.png");
});
