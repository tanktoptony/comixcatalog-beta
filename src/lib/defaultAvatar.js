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

// Uploaded avatars are served as stored. They used to go through Supabase's
// /render/image/ resize, which is billed per image and was switched off on
// 2026-11-21 after a $365 month of transforms; from then on every uploaded
// avatar 403'd. Uploads are already re-encoded to at most 512px JPEG in the
// browser (EditProfileModal), so the original is small. Square cropping is
// CSS object-fit (globals.css), not a server resize. A URL saved while the
// resize was on is turned back into the stored file's address.
const RENDER_AVATARS = "/storage/v1/render/image/public/avatars/";
const OBJECT_AVATARS = "/storage/v1/object/public/avatars/";
const RESIZE_PARAMS = ["width", "height", "resize", "quality"];

export function avatarImageUrl(url) {
  if (!url || url.startsWith("/avatars/")) return url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.pathname.includes(RENDER_AVATARS)) return url;
  parsed.pathname = parsed.pathname.replace(RENDER_AVATARS, OBJECT_AVATARS);
  for (const key of RESIZE_PARAMS) parsed.searchParams.delete(key);
  return parsed.toString();
}

export function avatarForProfile(profile, options) {
  if (profile?.avatar_url) return avatarImageUrl(profile.avatar_url, options);
  if (profile?.avatar_key && profile.avatar_key !== "cc_badge") {
    return `/avatars/${profile.avatar_key}.png`;
  }
  return defaultAvatarFor(profile?.id || profile?.username);
}
