import { createHash, randomBytes } from "node:crypto";

export const FOUNDING_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createFoundingToken() {
  return randomBytes(32).toString("base64url");
}

export function hashFoundingToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function isFoundingTokenExpired(createdAt, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  const current = now instanceof Date ? now.getTime() : Number(now);
  return !Number.isFinite(created) || !Number.isFinite(current) || current - created >= FOUNDING_TOKEN_TTL_MS;
}

export function mapFoundingClaim(data) {
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: Boolean(row?.claimed),
    number: row?.pass_number != null && Number.isInteger(Number(row.pass_number)) ? Number(row.pass_number) : null,
    remaining: Math.max(0, Number(row?.remaining) || 0),
  };
}

export function buildFoundingClaimEmail(email, confirmUrl) {
  const lines = [
    "Thanks for signing up for ComixCatalog.",
    "Confirm your email and your Founding Collector pass is yours, as long as one of the 100 is still open. They go first come, first served.",
  ];
  const text = `Hey,\n\n${lines.join("\n\n")}\n\nConfirm your email: ${confirmUrl}\n\nIf you didn't sign up, ignore this and nothing happens.\n\nTony\nComixCatalog`;
  const p = (s) => `<p style="font-family:Arial,sans-serif;color:#222;line-height:1.5">${s}</p>`;
  const html = [
    p("Hey,"),
    ...lines.map(p),
    `<p><a href="${confirmUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif">Confirm your email</a></p>`,
    p("If you didn't sign up, ignore this and nothing happens."),
    p("Tony<br>ComixCatalog"),
  ].join("");
  return { to: email, subject: "Confirm your email to claim your Founding Collector pass", text, html };
}
