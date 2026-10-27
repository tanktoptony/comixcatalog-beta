// Posts the next approved carousel in the Instagram comparison series
// (why ComixCatalog vs League of Comic Geeks, CLZ and Key Collector).
//
//   node scripts/igSeriesPost.js              post whatever is due today (UTC)
//   node scripts/igSeriesPost.js --dry-run    render + print, post nothing
//   node scripts/igSeriesPost.js --date=2026-11-03
//
// Every entry in scripts/igSeries/queue.json is a post Tony already approved,
// slides and caption, word for word. This script adds nothing of its own
// except the two things that go stale between approval and posting day:
//
//   1. The founding count. The last slide is rendered today from
//      founders-slide.html and the caption's {{spots_left}} is filled from a
//      live count, so "66 spots left" can't go out when 61 are left.
//   2. The competitor claim. If the competitor's own page loads and no longer
//      says what the slide says, the post is refused. If the page can't be
//      fetched at all (bot wall), it posts anyway: the slide and caption
//      carry the date the claim was checked.
//
// Runs from .github/workflows/ig-series.yml on Tuesdays. Posting days are
// whatever post_on says; the bot (instagramBot.js) keeps Fridays.

import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readJson, waitForContainerReady, publishContainer } from "./instagramBot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const SERIES_DIR = path.join(__dirname, "igSeries");
export const QUEUE_PATH = path.join(SERIES_DIR, "queue.json");
const FOUNDING_CAP = 100;
const GRAPH = "https://graph.facebook.com/v21.0";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Pure: the entry due on `today` (YYYY-MM-DD, UTC) that hasn't gone out.
// Only an exact date match: a post that missed its Tuesday waits for a
// person to move it, rather than landing on some other day by surprise.
export function dueEntry(queue, today) {
  return (queue?.posts ?? []).find((post) => post.post_on === today && !post.posted) ?? null;
}

export function spotsLeftText(remaining) {
  return `${remaining} ${remaining === 1 ? "spot" : "spots"} left`;
}

export function fillCaption(caption, remaining) {
  if (!caption.includes("{{spots_left}}")) return caption;
  return caption.replaceAll("{{spots_left}}", spotsLeftText(remaining));
}

// Pure: which of the expected phrases a fetched page no longer contains.
// Tags out, whitespace collapsed, case ignored, so "$ 49.00 PER YEAR" split
// across spans still matches "49.00 per year".
export function missingPhrases(html, phrases) {
  const text = String(html)
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return phrases.filter((phrase) => !text.includes(phrase.replace(/\s+/g, " ").toLowerCase()));
}

export function foundersSlideHtml(template, { remaining, slug, fontDir }) {
  return template
    .replaceAll("{{FONT_DIR}}", fontDir)
    .replaceAll("{{SPOTS}}", String(remaining))
    .replaceAll("{{SPOT_WORD}}", remaining === 1 ? "spot" : "spots")
    .replaceAll("{{SLUG}}", slug);
}

// curl, not fetch: League of Comic Geeks' bot wall answers Node's fetch with
// 403 even with a browser user agent, and lets curl with the same agent in
// (both tried 2026-10-27).
async function checkCompetitor(check) {
  if (!check?.url) return;
  let out;
  try {
    out = execFileSync("curl", ["-sL", "-m", "30", "-A", BROWSER_UA, "-w", "\n%{http_code}", check.url], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } catch (err) {
    console.warn(`Could not reach ${check.url} (${err.message}); posting on the dated claim.`);
    return;
  }
  const cut = out.lastIndexOf("\n");
  const status = Number(out.slice(cut + 1));
  if (status !== 200) {
    console.warn(`${check.url} answered ${status}; posting on the dated claim.`);
    return;
  }
  const missing = missingPhrases(out.slice(0, cut), check.must_contain ?? []);
  if (missing.length) {
    throw new Error(`${check.url} no longer says: ${missing.join(" | ")}. Not posting a claim that may be stale; re-check and edit the post.`);
  }
  console.log(`Competitor check passed: ${check.url}`);
}

async function foundingRemaining(supabase) {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_founding_collector", true);
  if (error) throw error;
  return Math.max(0, FOUNDING_CAP - (Number(count) || 0));
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return process.platform === "win32"
    ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
    : "google-chrome";
}

async function renderFoundersSlide({ remaining, slug }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "ig-series-"));
  const htmlPath = path.join(work, "founders.html");
  const pngPath = path.join(work, "founders.png");
  const template = fs.readFileSync(path.join(SERIES_DIR, "founders-slide.html"), "utf8");
  const fontDir = pathToFileURL(path.join(SERIES_DIR, "fonts")).href;
  fs.writeFileSync(htmlPath, foundersSlideHtml(template, { remaining, slug, fontDir }));
  execFileSync(chromePath(), [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--window-size=1080,1350", "--virtual-time-budget=6000",
    `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href,
  ], { stdio: "ignore", timeout: 120000 });
  const meta = await sharp(pngPath).metadata();
  if (meta.width !== 1080 || meta.height !== 1350) {
    throw new Error(`Founders slide rendered at ${meta.width}x${meta.height}, expected 1080x1350.`);
  }
  return { jpg: await sharp(pngPath).jpeg({ quality: 92 }).toBuffer(), dir: work };
}

async function uploadSlide(supabase, buffer, storagePath) {
  const { error } = await supabase.storage.from("comic-covers")
    .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw error;
  return supabase.storage.from("comic-covers").getPublicUrl(storagePath).data.publicUrl;
}

async function postCarousel(imageUrls, caption) {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igUserId || !token) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID / INSTAGRAM_ACCESS_TOKEN missing from environment");

  const children = [];
  for (const imageUrl of imageUrls) {
    const res = await fetch(`${GRAPH}/${igUserId}/media?` + new URLSearchParams({ image_url: imageUrl, is_carousel_item: "true", access_token: token }), { method: "POST" });
    const json = await readJson(res);
    if (!res.ok || !json.id) throw new Error(`Carousel item failed for ${imageUrl}: ${JSON.stringify(json)}`);
    await waitForContainerReady(json.id, token);
    children.push(json.id);
  }
  const res = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({ media_type: "CAROUSEL", children: children.join(","), caption, access_token: token }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.id) throw new Error(`Carousel container failed: ${JSON.stringify(json)}`);
  await waitForContainerReady(json.id, token);
  const mediaId = await publishContainer(igUserId, json.id, token);
  const linkRes = await fetch(`${GRAPH}/${mediaId}?` + new URLSearchParams({ fields: "permalink", access_token: token }));
  const link = await readJson(linkRes);
  return { mediaId, permalink: link.permalink ?? null };
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
  const today = dateArg ? dateArg.slice("--date=".length) : new Date().toISOString().slice(0, 10);

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
  const entry = dueEntry(queue, today);
  if (!entry) {
    console.log(`Nothing due on ${today}.`);
    return;
  }
  console.log(`Due today: ${entry.slug}`);

  await checkCompetitor(entry.check);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const remaining = await foundingRemaining(supabase);
  if (entry.founders_slide && remaining < 1) {
    throw new Error("All 100 founding passes are claimed; the founders slide and caption would be false. Edit the post.");
  }
  const caption = fillCaption(entry.caption, remaining);
  if (caption.includes("{{")) throw new Error("Caption still has an unfilled placeholder.");

  const slides = [...entry.slides];
  if (entry.founders_slide) {
    const { jpg, dir } = await renderFoundersSlide({ remaining, slug: entry.slug });
    if (dryRun) {
      const out = path.join(dir, `vs-${entry.slug}-4.jpg`);
      fs.writeFileSync(out, jpg);
      console.log(`Dry run: founders slide (${remaining} left) at ${out}`);
    } else {
      slides.push(await uploadSlide(supabase, jpg, `brand-cards/vs-${entry.slug}-4-${today}.jpg`));
    }
  }

  if (dryRun) {
    console.log(`Dry run: would post ${slides.length + (entry.founders_slide ? 1 : 0)} slides with caption:\n\n${caption}`);
    return;
  }

  const { mediaId, permalink } = await postCarousel(slides, caption);
  entry.posted = { media_id: mediaId, permalink, posted_at: new Date().toISOString(), spots_left: remaining, by: "ig-series.yml" };
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");
  console.log(`Posted ${entry.slug}: ${permalink ?? mediaId}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
