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

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000"
  );
}
