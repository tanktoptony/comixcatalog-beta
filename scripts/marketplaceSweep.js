import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { runMarketplaceSweep } from "./lib/marketplaceSweep.js";
import { resendBatch } from "../src/lib/newsletter.js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const stripeKey = process.env.STRIPE_MKT_SECRET_KEY;

if (!url || !key || !stripeKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STRIPE_MKT_SECRET_KEY are required");
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stripe = new Stripe(stripeKey);

async function notifyAdmin(message) {
  const to = process.env.REPORTS_NOTIFY_EMAIL;
  if (!to) {
    console.warn(message);
    return;
  }
  await resendBatch([{
    to,
    subject: "Marketplace sweep alert",
    text: message,
    html: `<p>${message}</p>`,
  }]);
}

const summary = await runMarketplaceSweep({ db, stripe, notifyAdmin, apply });
if (summary.errors) process.exitCode = 1;
