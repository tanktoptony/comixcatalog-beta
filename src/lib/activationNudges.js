import { createHmac, timingSafeEqual } from "node:crypto";

export const NUDGE_ONE_HOURS = 24;
export const NUDGE_TWO_HOURS = 72;
export const TEST_USERNAMES = new Set(["test_tony", "test_tony_depaul"]);
export const ACTIVATION_NUDGE_SEND_CAP = 50;

const SITE_URL = "https://www.comixcatalog.com";

export const ACTIVATION_NUDGE_COPY = {
  1: {
    subject: "Your long box is empty",
    intro: "Welcome to ComixCatalog. Glad you found us.",
    body: "The fastest way in: open ComixCatalog on your phone, tap Scan, and point it at a cover. Got a stack? Scan a stack and add them all at once.",
    button: "Scan your first comic",
    url: `${SITE_URL}/scan?utm_source=email&utm_medium=lifecycle&utm_campaign=nudge1`,
  },
  2: {
    subject: "Start with one book",
    intro: "Start with the one comic you're proudest to own. Search for it and add it to your collection.",
    body: "Grading, slab and cert tracking are free, too, so your best books get the details they deserve.",
    button: "Find your comic",
    url: `${SITE_URL}/search?utm_source=email&utm_medium=lifecycle&utm_campaign=nudge2`,
  },
};

function unsubscribeSecret() {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not set");
  return secret;
}

export function signTipsUnsubscribeToken(userId) {
  const id = String(userId).trim().toLowerCase();
  const encodedId = Buffer.from(id).toString("base64url");
  const signature = createHmac("sha256", unsubscribeSecret())
    .update(`tips:${id}`)
    .digest("base64url");
  return `${encodedId}.${signature}`;
}

export function verifyTipsUnsubscribeToken(token) {
  const [encodedId, supplied, ...extra] = String(token || "").split(".");
  if (!encodedId || !supplied || extra.length) return null;
  let userId;
  try {
    userId = Buffer.from(encodedId, "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    return null;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId)) return null;
  const expected = createHmac("sha256", unsubscribeSecret())
    .update(`tips:${userId}`)
    .digest();
  let actual;
  try { actual = Buffer.from(supplied, "base64url"); } catch { return null; }
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? userId : null;
}

export function chooseActivationNudge(profile, cutoff, now = new Date()) {
  const created = new Date(profile.created_at).getTime();
  const cutoffTime = new Date(cutoff).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(cutoffTime) || !Number.isFinite(current)) return null;
  if (created < cutoffTime || profile.email_tips === false) return null;
  if (TEST_USERNAMES.has(String(profile.username || "").toLowerCase())) return null;
  const ageHours = (current - created) / 3_600_000;
  if (ageHours >= NUDGE_TWO_HOURS && !profile.nudge2_sent_at) return 2;
  if (ageHours >= NUDGE_ONE_HOURS && ageHours < NUDGE_TWO_HOURS && !profile.nudge1_sent_at) return 1;
  return null;
}

export function hasOwnedOrForSale(collectionRows) {
  return collectionRows.some((row) => row.status === "owned" || row.status === "for_sale");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function buildActivationNudgeEmail(nudge, email, userId) {
  const copy = ACTIVATION_NUDGE_COPY[nudge];
  if (!copy) throw new Error(`Unknown activation nudge: ${nudge}`);
  const unsubscribeUrl = `${SITE_URL}/unsubscribe/tips?token=${encodeURIComponent(signTipsUnsubscribeToken(userId))}`;
  const text = `${copy.intro}\n\n${copy.body}\n\n${copy.button}: ${copy.url}\n\nUnsubscribe: ${unsubscribeUrl}`;
  const html = `<p style="font-family:Arial,sans-serif;color:#222">${escapeHtml(copy.intro)}</p><p style="font-family:Arial,sans-serif;color:#222">${escapeHtml(copy.body)}</p><p><a href="${copy.url}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif">${escapeHtml(copy.button)}</a></p><p style="font-family:Arial,sans-serif;font-size:12px;color:#666"><a href="${unsubscribeUrl}">Unsubscribe from tips to get started</a></p>`;
  return { to: email, subject: copy.subject, text, html, headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } };
}
