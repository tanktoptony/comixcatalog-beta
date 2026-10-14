import Stripe from "stripe";

let cached;

export function marketplaceLivemodeForKey(key = process.env.STRIPE_MKT_SECRET_KEY) {
  return Boolean(key?.startsWith("sk_live_"));
}

export const MARKETPLACE_LIVEMODE = marketplaceLivemodeForKey();

export function getMarketplaceStripe() {
  if (cached) return cached;
  const key = process.env.STRIPE_MKT_SECRET_KEY;
  if (!key) throw new Error("STRIPE_MKT_SECRET_KEY is not set");
  if (marketplaceLivemodeForKey(key) && process.env.MARKETPLACE_STRIPE_LIVE !== "1") {
    throw new Error("Live marketplace Stripe key requires MARKETPLACE_STRIPE_LIVE=1");
  }
  cached = new Stripe(key);
  return cached;
}
