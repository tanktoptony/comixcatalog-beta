// Newsletter plumbing shared by the API routes and scripts/sendNewsletter.js.
//
// Unsubscribe links are signed, not stored: token = HMAC-SHA256(email) under
// a key derived from the service-role secret. Nothing about the key leaks
// through an HMAC, it needs no new column (migrations are hand-applied by
// the founder) and no new secret in GitHub/Vercel. If a dedicated secret is
// ever added, set NEWSLETTER_UNSUB_SECRET and existing links keep working
// only until the next send, which is fine.
//
// Sending goes through Resend's HTTP API directly (no SDK dependency).
// RESEND_API_KEY and RESEND_FROM_EMAIL live in .env.local / repo secrets /
// Vercel, never in a file. See .env.example.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.comixcatalog.com").replace(/\/+$/, "");

function unsubKey() {
  const secret = process.env.NEWSLETTER_UNSUB_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("no secret available for unsubscribe tokens");
  return createHmac("sha256", "comixcatalog-newsletter-unsubscribe").update(secret).digest();
}

export function unsubscribeToken(email) {
  return createHmac("sha256", unsubKey()).update(String(email).trim().toLowerCase()).digest("base64url");
}

export function verifyUnsubscribeToken(email, token) {
  if (!email || !token) return false;
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(String(token));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(email) {
  const e = Buffer.from(String(email).trim().toLowerCase()).toString("base64url");
  return `${SITE_URL}/api/newsletter/unsubscribe?e=${e}&t=${unsubscribeToken(email)}`;
}

export function emailFromParam(e) {
  try {
    return Buffer.from(String(e), "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    return null;
  }
}

// Resend batch send. `messages` is an array of { to, subject, html, text,
// headers }. Resend accepts up to 100 per batch call.
export async function resendBatch(messages) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const from = process.env.RESEND_FROM_EMAIL || "ComixCatalog <hello@comixcatalog.com>";
  const out = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ from, ...m }));
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend ${res.status}: ${json?.message ?? JSON.stringify(json).slice(0, 200)}`);
    out.push(...(json?.data ?? []));
  }
  return out;
}
