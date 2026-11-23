// Cross-posts each newly published blog post: its "New on the blog" card to
// Instagram and the Facebook Page, and an email to Tony with the Patreon post
// ready to paste (Patreon has no API for creating posts).
//
//   node scripts/crossPostBlog.js            # dry run: prints what would go out
//   node scripts/crossPostBlog.js --apply    # posts and emails
//
// Runs hourly from .github/workflows/blog-crosspost.yml. Each channel is
// recorded once it succeeds (Instagram in the bot's own ledger, the others in
// scripts/.blog-crossposted.json), so a failed channel retries next hour for
// up to CROSSPOST_WINDOW_DAYS. Facebook needs a Page token with
// pages_manage_posts; until it has one, Facebook is skipped and retried.
//
// Relative imports only: this runs as a plain Node script.

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { renderBrandCard } from "./lib/brandCard.js";
import { appendLedger as appendIgLedger, imageLedgerKey, loadLedger as loadIgLedger, postToInstagram, readJson } from "./instagramBot.js";
import { resendBatch } from "../src/lib/newsletter.js";
import { SITE_URL } from "../src/lib/siteUrl.js";
import {
  CROSSPOST_SINCE,
  facebookMessage,
  instagramCaption,
  isMissingPermission,
  ledgerKey,
  patreonEmail,
  pendingChannels,
} from "./lib/blogCrossPost.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const APPLY = process.argv.includes("--apply");
const LEDGER_PATH = path.resolve(__dirname, ".blog-crossposted.json");
const GRAPH = "https://graph.facebook.com/v21.0";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function loadLedger() {
  try {
    return new Set(JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")));
  } catch {
    return new Set();
  }
}

function appendLedger(key) {
  const ledger = loadLedger();
  ledger.add(key);
  fs.writeFileSync(LEDGER_PATH, JSON.stringify([...ledger], null, 2) + "\n");
}

async function uploadCard(post) {
  const png = await renderBrandCard({
    kicker: "New on the blog",
    headline: post.title,
    subtext: post.excerpt || "New on the ComixCatalog blog.",
    accent: "gold",
  });
  const storagePath = `brand-cards/blog-${post.slug}.png`;
  const { error } = await supabase.storage.from("comic-covers").upload(storagePath, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Card upload failed: ${error.message}`);
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${storagePath}`;
}

// The Instagram token is the Facebook Page's token, so /me is the Page.
async function postToFacebook({ imageUrl, message }) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN missing from environment");
  const res = await fetch(`${GRAPH}/me/photos?` + new URLSearchParams({ url: imageUrl, message, access_token: token }), { method: "POST" });
  const json = await readJson(res);
  if (res.ok && (json.post_id || json.id)) return { id: json.post_id || json.id };
  return { error: json.error ?? { message: JSON.stringify(json).slice(0, 300) } };
}

async function crossPost(post, posted) {
  const pending = pendingChannels(post, posted);
  if (!pending.length) return false;
  console.log(`\n"${post.title}" (${post.slug}): ${pending.join(", ")}`);

  if (!APPLY) {
    if (pending.includes("instagram")) console.log(`[dry run] Instagram caption:\n${instagramCaption(post)}\n`);
    if (pending.includes("facebook")) console.log(`[dry run] Facebook message:\n${facebookMessage(post, SITE_URL)}\n`);
    if (pending.includes("patreon")) console.log(`[dry run] Patreon email to ${process.env.REPORTS_NOTIFY_EMAIL ? "the reports address" : "(REPORTS_NOTIFY_EMAIL not set)"}`);
    return false;
  }

  const imageUrl = await uploadCard(post);
  const results = {};
  let failed = false;

  if (pending.includes("instagram")) {
    try {
      const id = await postToInstagram({ imageUrl, caption: instagramCaption(post) });
      appendIgLedger(ledgerKey("instagram", post.slug));
      const imgKey = imageLedgerKey(imageUrl);
      if (imgKey) appendIgLedger(imgKey);
      results.Instagram = "posted";
      console.log(`Instagram: posted (${id})`);
    } catch (err) {
      results.Instagram = `not posted yet (${err.message.slice(0, 160)}); retrying hourly`;
      console.error(`Instagram failed: ${err.message}`);
      failed = true;
    }
  }

  if (pending.includes("facebook")) {
    const fb = await postToFacebook({ imageUrl, message: facebookMessage(post, SITE_URL) });
    if (fb.id) {
      appendLedger(ledgerKey("facebook", post.slug));
      results.Facebook = "posted";
      console.log(`Facebook: posted (${fb.id})`);
    } else if (isMissingPermission(fb.error)) {
      results.Facebook = "skipped: the Page token can't post to Facebook yet (needs pages_manage_posts); retrying hourly for a week";
      console.warn(`Facebook skipped: ${fb.error.message}`);
    } else {
      results.Facebook = `not posted yet (${String(fb.error.message).slice(0, 160)}); retrying hourly`;
      console.error(`Facebook failed: ${fb.error.message}`);
      failed = true;
    }
  }

  if (pending.includes("patreon")) {
    const to = process.env.REPORTS_NOTIFY_EMAIL;
    if (!to) throw new Error("REPORTS_NOTIFY_EMAIL is not set");
    const { subject, html } = patreonEmail({ post, siteUrl: SITE_URL, imageUrl, results });
    await resendBatch([{ to, subject, html }]);
    appendLedger(ledgerKey("patreon", post.slug));
    console.log("Patreon: text emailed");
  }
  return failed;
}

async function run() {
  const { data: posts, error } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, published_at")
    .eq("published", true)
    .gte("published_at", CROSSPOST_SINCE)
    .order("published_at", { ascending: true });
  if (error) throw new Error(`Could not read blog posts: ${error.message}`);

  const posted = new Set([...loadIgLedger(), ...loadLedger()]);
  let failed = false;
  for (const post of posts ?? []) {
    if (await crossPost(post, posted)) failed = true;
  }
  if (!posts?.length) console.log(`No blog posts published since ${CROSSPOST_SINCE}.`);
  if (failed) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
