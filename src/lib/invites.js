import { SITE_URL } from "./siteUrl.js";

export const INVITE_SHARE_TEXT = "I'm cataloging my comics on ComixCatalog. Come see my collection and start yours:";
export const INVITE_NEW_ACCOUNT_HOURS = 24;

export function normalizeInviteRef(value) {
  const ref = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9_]{3,20}$/.test(ref) ? ref : null;
}

export function isInviteEligible({ createdAt, invitedBy = null, now = Date.now() }) {
  if (invitedBy) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= 0 && age < INVITE_NEW_ACCOUNT_HOURS * 60 * 60 * 1000;
}

export function buildInviteUrl(username, origin = SITE_URL) {
  const ref = normalizeInviteRef(username);
  if (!ref) return null;
  return `${String(origin).replace(/\/+$/, "")}/join/${encodeURIComponent(ref)}`;
}

export function buildInviteShare(username, origin = SITE_URL) {
  const url = buildInviteUrl(username, origin);
  return url ? { title: "Join me on ComixCatalog", text: INVITE_SHARE_TEXT, url } : null;
}
