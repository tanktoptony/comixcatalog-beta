import Stripe from "stripe";

let cached = null;

export function getStripe() {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  cached = new Stripe(key);
  return cached;
}

export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;
export const FOUNDING_PRICE_ID = process.env.STRIPE_FOUNDING_PRICE_ID;
export const PLUS_MONTHLY_PRICE_ID = process.env.STRIPE_PLUS_MONTHLY_PRICE_ID;
export const PLUS_ANNUAL_PRICE_ID = process.env.STRIPE_PLUS_ANNUAL_PRICE_ID;

// Stripe needs absolute URLs with a scheme. VERCEL_URL is a bare host
// ("x.vercel.app") and production has no NEXT_PUBLIC_SITE_URL, which made
// every checkout fail with "An explicit scheme must be provided".
export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return withScheme(explicit);
  if (process.env.VERCEL_ENV === "production") return "https://www.comixcatalog.com";
  if (process.env.VERCEL_URL) return withScheme(process.env.VERCEL_URL);
  return "http://localhost:3000";
}

function withScheme(url) {
  const trimmed = String(url).trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
