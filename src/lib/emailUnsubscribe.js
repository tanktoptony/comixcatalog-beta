import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "./emailPrefs.js";

// One-click unsubscribe links for the activity and digest emails. Same token
// shape as the tips link in activationNudges.js (base64url user id, then an
// HMAC of "<scope>:<id>" with EMAIL_UNSUBSCRIBE_SECRET); the scope in the
// HMAC means a digest link can't turn off activity emails or tips.
export const UNSUBSCRIBE_SCOPES = ["activity", "digest"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function secret() {
  const value = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!value) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not set");
  return value;
}

function assertScope(scope) {
  if (!UNSUBSCRIBE_SCOPES.includes(scope)) throw new Error(`Unknown unsubscribe scope: ${scope}`);
}

export function signUnsubscribeToken(scope, userId) {
  assertScope(scope);
  const id = String(userId).trim().toLowerCase();
  const signature = createHmac("sha256", secret()).update(`${scope}:${id}`).digest("base64url");
  return `${Buffer.from(id).toString("base64url")}.${signature}`;
}

export function verifyUnsubscribeToken(scope, token) {
  if (!UNSUBSCRIBE_SCOPES.includes(scope)) return null;
  const [encodedId, supplied, ...extra] = String(token || "").split(".");
  if (!encodedId || !supplied || extra.length) return null;
  let userId;
  try { userId = Buffer.from(encodedId, "base64url").toString("utf8").trim().toLowerCase(); } catch { return null; }
  if (!UUID.test(userId)) return null;
  const expected = createHmac("sha256", secret()).update(`${scope}:${userId}`).digest();
  let actual;
  try { actual = Buffer.from(supplied, "base64url"); } catch { return null; }
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? userId : null;
}

export function unsubscribeLink(scope, userId) {
  return `${SITE_URL}/unsubscribe/${scope}?token=${encodeURIComponent(signUnsubscribeToken(scope, userId))}`;
}
