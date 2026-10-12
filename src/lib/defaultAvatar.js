export const DEFAULT_AVATAR_COUNT = 12;

// FNV-1a is small, deterministic in every JS runtime, and distributes short
// usernames and UUIDs well enough for a fixed set of visual defaults.
export function defaultAvatarFor(userIdOrUsername) {
  const value = String(userIdOrUsername ?? "").trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const number = String((hash >>> 0) % DEFAULT_AVATAR_COUNT + 1).padStart(2, "0");
  return `/avatars/default/cc_${number}.webp`;
}

export function avatarForProfile(profile) {
  if (profile?.avatar_url) return profile.avatar_url;
  if (profile?.avatar_key && profile.avatar_key !== "cc_badge") {
    return `/avatars/${profile.avatar_key}.png`;
  }
  return defaultAvatarFor(profile?.id || profile?.username);
}
