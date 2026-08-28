// Daily Instagram auto-post bot. Rotates through three content types using
// data already in the catalog — no manual content creation.
//
// See docs/instagram-bot-plan.md for the full plan and Meta/Instagram
// account setup steps.
//
// Usage:
//   node scripts/instagramBot.js --dry-run     # select + print, no post, no creds needed
//   node scripts/instagramBot.js               # select + post live (needs env vars below)
//
// Env vars required for a live post (not for --dry-run):
//   INSTAGRAM_BUSINESS_ACCOUNT_ID
//   INSTAGRAM_ACCESS_TOKEN
//
// Uses relative imports only (no @/ aliases) — this runs as a raw Node
// script outside Next.js, same constraint as scripts/fetchEbayComps.js.

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "../src/lib/featuredSeries.js";
import { renderBrandCard } from "./lib/brandCard.js";
import { pickBrandPost as pickBrandPostContent } from "./lib/brandPostContent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const LEDGER_PATH = path.resolve(__dirname, ".instagram-posted.json");
const LAST_POST_DATE_PATH = path.resolve(__dirname, ".instagram-last-post-date.json");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

function coverUrl(storagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`;
}

// Loose publisher comparison — strips suffixes so "Marvel Comics" matches
// "Marvel". Same normalization pattern used elsewhere in this repo's
// ingestion scripts (e.g. scripts/findUncoveredSeries.js).
function normPublisher(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .replace(/\b(comics|entertainment|publishing|inc\.?|llc|ltd|company|co\.?|s\.a\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Exported (alongside the pickers/caption builder below) so
// scripts/previewInstagramQueue.js can reuse the real selection logic
// for a multi-day preview without duplicating it.
export function loadLedger() {
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

// "Already posted today" guard — added 2026-08-28 after the daily cron
// (`0 17 * * *`) silently failed to fire at all for a full day (confirmed
// via GitHub's own run history: no run between 2026-08-28T01:18 and 20:24,
// a >19h gap through the scheduled 17:00 slot). GitHub's schedule trigger is
// already documented as unreliable for this repo (see cover-ingest.yml's
// header) — same failure mode, just previously unnoticed here because
// nothing else was watching for it.
//
// Fix: the workflow now runs hourly instead of once a day (~24 chances for
// GitHub's flaky scheduler to actually fire instead of 1), and this guard
// makes that safe — it's a no-op every hour except the first successful one
// each day, so it can never post twice in a day even if the schedule DOES
// fire reliably plus someone workflow_dispatches it by hand.
function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function alreadyPostedToday() {
  try {
    const { date } = JSON.parse(fs.readFileSync(LAST_POST_DATE_PATH, "utf8"));
    return date === todayStamp();
  } catch {
    return false;
  }
}

function recordPostedToday() {
  fs.writeFileSync(LAST_POST_DATE_PATH, JSON.stringify({ date: todayStamp() }, null, 2) + "\n");
}

// Simple era-based cover-price floor — mirrors src/lib/valuation.js's
// coverPriceForYear but reimplemented here to avoid a @/ alias import
// (that file imports nothing else, so this stays a 1:1 copy, not a fork
// of real logic — keep in sync if the pricing curve there changes).
export function coverPriceForYear(year) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  if (y >= 2020) return 4;
  if (y >= 2010) return 3.5;
  if (y >= 2000) return 2.5;
  if (y >= 1990) return 1.5;
  if (y >= 1980) return 0.75;
  if (y >= 1970) return 0.25;
  return 0.15;
}

function median(values) {
  const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
}

async function lookupValue(gcdIssueId) {
  if (gcdIssueId == null) return null;
  const { data } = await supabase
    .from("market_comps")
    .select("sold_price, grade_bucket")
    .eq("gcd_issue_id", gcdIssueId)
    .in("grade_bucket", ["Raw NM", "Slabbed 9.4", "Slabbed 9.6"])
    .order("sold_date", { ascending: false })
    .limit(20);
  if (!data || data.length < 2) return null;
  return { value: median(data.map((r) => r.sold_price)), sampleSize: data.length };
}

function tagify(value) {
  return value ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : null;
}

// "#keyissues" only applies when the post is actually about a comp-verified
// key issue — claiming every post is a "key issue" would be exactly the
// marketer-hype-over-collector-trust move the brand explicitly avoids
// (see NORTH_STAR.md §2.5). Everything else gets collector-community tags
// instead, plus a series-specific tag (previously missing entirely) and a
// branded tag so the account's own posts become searchable over time.
//
// EXTRA_HASHTAG_POOL rotates 2 tags in on top of the fixed set so the tag
// block doesn't look identical post to post — dayIndex-driven like the CTA
// rotation below, so the two rotations naturally fall out of sync.
// "#vintagecomics" is handled separately (below) rather than living in this
// pool, since it needs to only fire when the book is actually old — the
// pool has no notion of which post it's rotating into.
const EXTRA_HASHTAG_POOL = ["#longbox", "#backissues", "#comicshop", "#graphicnovels", "#comicart"];
const VINTAGE_CUTOFF_YEAR = 1990;

function hashtagsFor(publisher, year, title, isKeyIssue, dayIndex = Math.floor(Date.now() / 86400000)) {
  const decade = year ? `${Math.floor(year / 10) * 10}s` : null;
  const pubTag = tagify(publisher);
  const titleTag = tagify(title);
  const poolStart = ((dayIndex % EXTRA_HASHTAG_POOL.length) + EXTRA_HASHTAG_POOL.length) % EXTRA_HASHTAG_POOL.length;
  const extras = [EXTRA_HASHTAG_POOL[poolStart], EXTRA_HASHTAG_POOL[(poolStart + 1) % EXTRA_HASHTAG_POOL.length]];
  const tags = [
    "#comics",
    "#comicbooks",
    isKeyIssue ? "#keyissues" : "#comicbookcollector",
    "#comicbookcollecting",
    titleTag && `#${titleTag}`,
    pubTag && `#${pubTag}`,
    decade && `#${decade}comics`,
    ...extras,
    year && year < VINTAGE_CUTOFF_YEAR ? "#vintagecomics" : null,
    "#comixcatalog",
  ].filter(Boolean);
  return [...new Set(tags)].join(" "); // de-dupe in case title/publisher collide
}

// Marvel/Image solicit text often leads with an ALL CAPS credits-drop
// sentence ("BATMAN LEGEND SCOTT SNYDER AND ICONIC ARTIST NICK DRAGOTTA...")
// before the actual synopsis — reads as shouty marketing hype in an IG
// caption, cutting against the collector-trust voice NORTH_STAR.md calls
// for. Rewriting it to sentence-case was tried and rejected: lowercasing
// creator names mid-sentence (SCOTT SNYDER → "scott snyder") looks like a
// bug, not a fix. Dropping shouty sentences outright is safer — the
// (normal-case) sentence that follows is usually the real synopsis anyway.
function stripShoutySentences(text) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  return sentences
    .filter((sentence) => {
      const letters = sentence.replace(/[^A-Za-z]/g, "");
      if (letters.length < 8) return true; // too short to judge reliably, keep
      const upperCount = (sentence.match(/[A-Z]/g) || []).length;
      return upperCount / letters.length < 0.6;
    })
    .join("")
    .trim();
}

// GCD's `description` field is raw HTML and wildly inconsistent in shape:
// a clean synopsis paragraph for most modern single-story issues, solicit
// text followed by a "List of covers and their creators" table for
// Marvel/Image, or (mostly older/UK anthology) a <ol>/<li> list of several
// unrelated backup features. Only the first case makes a coherent caption
// line, so this bails out to null rather than posting a garbled fragment —
// callers fall back to the existing title/publisher/value-only caption.
export function synopsisFromDescription(html, { maxLen = 200 } = {}) {
  if (!html) return null;

  let text = html.split(/<h4>/i)[0]; // drop Marvel/Image's trailing covers table

  const liCount = (text.match(/<li[\s>]/gi) || []).length;
  if (liCount > 1) return null; // multi-story anthology issue, not a single blurb

  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  text = stripShoutySentences(text);

  if (text.length < 20) return null;
  if (text.length <= maxLen) return text;

  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLen)}…`;
}

// Rotated by dayIndex so the CTA sentence varies without needing per-post
// randomness (keeps the preview tool's future-day simulation deterministic).
const CTA_VARIANTS = [
  "Catalogued on ComixCatalog — link in bio",
  "Built by collectors, for collectors — ComixCatalog, link in bio",
  "Track your own collection on ComixCatalog — link in bio",
];

export function buildCaption({
  title,
  issueNumber,
  year,
  publisher,
  valueLine,
  kicker,
  postType,
  synopsis,
  dayIndex = Math.floor(Date.now() / 86400000),
}) {
  const header = `${title}${issueNumber ? ` #${issueNumber}` : ""}${year ? ` (${year})` : ""}`;
  const cta = CTA_VARIANTS[((dayIndex + 1) % CTA_VARIANTS.length + CTA_VARIANTS.length) % CTA_VARIANTS.length];
  const lines = [
    kicker,
    header,
    publisher,
    valueLine,
    synopsis,
    "",
    cta,
    hashtagsFor(publisher, year, title, postType === "Key Issue Value Check", dayIndex),
  ].filter((l) => l !== undefined && l !== null);
  return lines.join("\n");
}

// ── Content type 1: Cover Spotlight — random pick from the curated list ────
export async function pickCoverSpotlight(seenKeys) {
  const candidates = [...FEATURED_SERIES].sort(() => Math.random() - 0.5);
  for (const entry of candidates) {
    const { data: series } = await supabase
      .from("series")
      .select("id, gcd_id, title, year_start_cached, resolved_publisher_cached, featured_cover_path_cached")
      .eq("title", entry.title)
      .not("featured_cover_path_cached", "is", null)
      .limit(20);

    // Publisher-gated: a bare title match can land on a foreign reprint
    // edition sharing the same title (caught live via a French "Spider-Man"
    // edition during preview testing) — filter to the publisher
    // featuredSeries.js actually specifies before falling back to year.
    const entryPub = normPublisher(entry.publisher);
    const publisherMatches = (series ?? []).filter(
      (s) => !entryPub || normPublisher(s.resolved_publisher_cached) === entryPub
    );
    const candidatePool = publisherMatches.length > 0 ? publisherMatches : [];
    const match = candidatePool.find(
      (s) => !entry.prefer_year || Math.abs((s.year_start_cached ?? 0) - entry.prefer_year) <= 2
    ) ?? candidatePool[0];
    if (!match) continue;
    const key = `spotlight:${match.gcd_id}`;
    if (seenKeys.has(key)) continue;

    // featured_cover_path_cached is whichever cover got cached during a
    // search-refresh pass — NOT necessarily issue #1. Look up the actual
    // issue number for that exact cover rather than assuming, since
    // claiming the wrong issue # is worse than omitting it.
    const { data: coverRow } = await supabase
      .from("canonical_covers")
      .select("gcd_issue_id, issue_number, description")
      .eq("storage_path", match.featured_cover_path_cached)
      .limit(1)
      .maybeSingle();

    return {
      type: "Cover Spotlight",
      dedupeKey: key,
      imageUrl: coverUrl(match.featured_cover_path_cached),
      title: match.title,
      issueNumber: coverRow?.issue_number ?? null,
      year: match.year_start_cached,
      publisher: match.resolved_publisher_cached,
      gcdIssueId: coverRow?.gcd_issue_id ?? null,
      description: coverRow?.description ?? null,
    };
  }
  return null;
}

// ── Content type 2: New to the Catalog — most recent resolved cover add ────
export async function pickNewToCatalog(seenKeys) {
  const { data } = await supabase
    .from("canonical_covers")
    .select("gcd_issue_id, series_title, issue_number, series_year, publisher, storage_path, created_at, description")
    .eq("match_confidence", "resolved")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  for (const row of data ?? []) {
    const key = `new:${row.gcd_issue_id}`;
    if (seenKeys.has(key)) continue;
    return {
      type: "New to the Catalog",
      dedupeKey: key,
      imageUrl: coverUrl(row.storage_path),
      title: row.series_title,
      issueNumber: row.issue_number,
      year: row.series_year,
      publisher: row.publisher,
      gcdIssueId: row.gcd_issue_id,
      description: row.description ?? null,
    };
  }
  return null;
}

// ── Content type 3: Key Issue Value Check — a resolved issue with real comps ─
export async function pickValueCheck(seenKeys) {
  const { data } = await supabase
    .from("market_comps")
    .select("gcd_issue_id")
    .not("gcd_issue_id", "is", null)
    .order("sold_date", { ascending: false })
    .limit(100);
  const candidateIds = [...new Set((data ?? []).map((r) => r.gcd_issue_id))];
  for (const gcdIssueId of candidateIds) {
    const key = `value:${gcdIssueId}`;
    if (seenKeys.has(key)) continue;
    const valueInfo = await lookupValue(gcdIssueId);
    if (!valueInfo) continue;
    const { data: cover } = await supabase
      .from("canonical_covers")
      .select("series_title, issue_number, series_year, publisher, storage_path, description")
      .eq("gcd_issue_id", gcdIssueId)
      .not("storage_path", "is", null)
      .limit(1)
      .maybeSingle();
    if (!cover) continue;
    return {
      type: "Key Issue Value Check",
      dedupeKey: key,
      imageUrl: coverUrl(cover.storage_path),
      title: cover.series_title,
      issueNumber: cover.issue_number,
      year: cover.series_year,
      publisher: cover.publisher,
      gcdIssueId,
      valueInfo,
      description: cover.description ?? null,
    };
  }
  return null;
}

function slugifyForPath(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "post";
}

const BRAND_HASHTAGS = "#comiccollecting #comicbookdatabase #collectiblecomics #comicbookcollector #comixcatalog";

// Not a comic post — no title/issue/publisher fields, so this is a
// deliberately separate, simpler caption builder rather than another branch
// bolted onto buildCaption(). Reuses the same CTA rotation for consistency.
export function buildBrandCaption({ kicker, headline, captionBody, dayIndex = Math.floor(Date.now() / 86400000) }) {
  const cta = CTA_VARIANTS[((dayIndex + 1) % CTA_VARIANTS.length + CTA_VARIANTS.length) % CTA_VARIANTS.length];
  const lines = [`✦ ${kicker}`, headline, "", captionBody, "", cta, BRAND_HASHTAGS].filter(
    (l) => l !== undefined && l !== null && l !== ""
  );
  return lines.join("\n");
}

// Wraps brandPostContent's text-only pickBrandPost with the image side:
// render the card, upload it to the same public bucket the comic posts'
// user-photo uploads already use (no new bucket/policy needed), return the
// same shape the comic pickers return so selectPost()'s fallback loop and
// run()'s posting logic don't need to know the difference until caption time.
export async function pickBrandPost(seenKeys) {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const content = await pickBrandPostContent(supabase, seenKeys, dayIndex);
  if (!content) return null;

  const png = await renderBrandCard({
    kicker: content.kicker,
    headline: content.headline,
    subtext: content.subtext,
    accent: content.accent,
  });
  const storagePath = `brand-cards/${slugifyForPath(content.dedupeKey)}.png`;
  const { error: uploadError } = await supabase.storage
    .from("comic-covers")
    .upload(storagePath, png, { contentType: "image/png", upsert: true });
  if (uploadError) {
    console.error(`Brand card upload failed: ${uploadError.message}`);
    return null;
  }

  return {
    type: "Brand",
    dedupeKey: content.dedupeKey,
    imageUrl: `${SUPABASE_URL}/storage/v1/object/public/comic-covers/${storagePath}`,
    kicker: content.kicker,
    headline: content.headline,
    captionBody: content.captionBody,
  };
}

async function selectPost() {
  const seenKeys = loadLedger();
  // Rotate types by day-of-year so it's not random-feeling day to day.
  // 7-slot cycle: the 3 comic pickers get two slots each (still leading
  // most days) and the brand picker gets 1 — roughly once a week rather
  // than competing evenly, so the feed doesn't turn into a stats-spam
  // account. Easy to change the ratio later by adjusting this array.
  const pickers = [
    pickCoverSpotlight, pickNewToCatalog, pickValueCheck,
    pickCoverSpotlight, pickNewToCatalog, pickValueCheck,
    pickBrandPost,
  ];
  const dayIndex = Math.floor(Date.now() / 86400000) % pickers.length;
  const order = [...pickers.slice(dayIndex), ...pickers.slice(0, dayIndex)];
  for (const picker of order) {
    const post = await picker(seenKeys);
    if (post) return post;
  }
  return null;
}

// Graph API normally replies with JSON, but under transient outages (edge
// gateway errors, WAF interstitials) it replies with an HTML error page
// instead — res.json() then throws a raw "Unexpected token '<'" SyntaxError
// that hides the real (retryable) cause. Read as text first so a non-JSON
// body becomes a clear, truncated error instead of a crash.
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Non-JSON response (status ${res.status}): ${text.slice(0, 300)}`
    );
  }
}

// Container creation returns immediately, but Instagram fetches + transcodes
// the image asynchronously — status_code stays IN_PROGRESS until it's actually
// ready. Publishing before that hits error 9007 ("media is not ready for
// publishing"). Poll until FINISHED (or ERROR/EXPIRED) instead of publishing
// right away.
async function waitForContainerReady(containerId, token, { timeoutMs = 90000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?` +
        new URLSearchParams({ fields: "status_code", access_token: token })
    );
    const json = await readJson(res);
    if (!res.ok) {
      throw new Error(`Container status check failed: ${JSON.stringify(json)}`);
    }
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      throw new Error(`Media container failed to process: ${JSON.stringify(json)}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Media container never finished processing (last status_code=${json.status_code})`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Even after status_code reports FINISHED, media_publish can still bounce
// with error_subcode 2207027 ("media is not ready for publishing, please
// wait for a moment") — hit live on 2026-08-25. Meta's own guidance for this
// subcode is to retry after a short wait rather than treat it as fatal, so
// retry a few times before giving up.
const TRANSIENT_PUBLISH_SUBCODE = 2207027;

async function publishContainer(igUserId, containerId, token, { retries = 4, delayMs = 5000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish?` +
        new URLSearchParams({ creation_id: containerId, access_token: token }),
      { method: "POST" }
    );
    const publishJson = await readJson(publishRes);
    if (publishRes.ok && publishJson.id) return publishJson.id;

    const subcode = publishJson?.error?.error_subcode;
    if (subcode === TRANSIENT_PUBLISH_SUBCODE && attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    throw new Error(`Publish failed: ${JSON.stringify(publishJson)}`);
  }
}

async function postToInstagram({ imageUrl, caption }) {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igUserId || !token) {
    throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID / INSTAGRAM_ACCESS_TOKEN missing from environment");
  }

  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media?` +
      new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
    { method: "POST" }
  );
  const createJson = await readJson(createRes);
  if (!createRes.ok || !createJson.id) {
    throw new Error(`Media container creation failed: ${JSON.stringify(createJson)}`);
  }

  await waitForContainerReady(createJson.id, token);

  return publishContainer(igUserId, createJson.id, token);
}

async function run() {
  // Skipped for --dry-run so testing/preview still works any time of day.
  if (!DRY_RUN && alreadyPostedToday()) {
    console.log(`Already posted today (${todayStamp()}) — skipping. Expected most hours now that this runs hourly; see the "already posted today" guard comment above.`);
    return;
  }

  const post = await selectPost();
  if (!post) {
    console.log("No eligible content found (ledger may have exhausted all candidates).");
    return;
  }

  let caption;
  if (post.type === "Brand") {
    caption = buildBrandCaption({
      kicker: post.kicker,
      headline: post.headline,
      captionBody: post.captionBody,
    });
    console.log(`Selected: Brand — ${post.kicker}: ${post.headline}`);
  } else {
    const kicker = { "Cover Spotlight": "✦ Cover Spotlight", "New to the Catalog": "✦ New to the Catalog", "Key Issue Value Check": "✦ Value Check" }[post.type];
    const valueLine = post.valueInfo
      ? `Est. value (raw NM-ish, ${post.valueInfo.sampleSize} sales): $${post.valueInfo.value.toFixed(0)}`
      : post.type === "Key Issue Value Check"
        ? null
        : (() => {
            const floor = coverPriceForYear(post.year);
            return floor ? `Est. cover-price floor: $${floor.toFixed(2)}` : null;
          })();

    caption = buildCaption({
      title: post.title,
      issueNumber: post.issueNumber,
      year: post.year,
      publisher: post.publisher,
      valueLine,
      kicker,
      postType: post.type,
      synopsis: synopsisFromDescription(post.description),
    });
    console.log(`Selected: ${post.type} — ${post.title} #${post.issueNumber} (${post.year ?? "?"})`);
  }

  console.log(`Image: ${post.imageUrl}`);
  console.log(`Caption:\n${caption}\n`);

  if (DRY_RUN) {
    console.log("[dry-run] Not posting.");
    return;
  }

  const publishedId = await postToInstagram({ imageUrl: post.imageUrl, caption });
  appendLedger(post.dedupeKey);
  recordPostedToday();
  console.log(`Posted. Instagram media id: ${publishedId}`);
}

// Only auto-run when executed directly (`node scripts/instagramBot.js`),
// not when imported as a module (e.g. by previewInstagramQueue.js) — an
// unguarded call here would fire a real post attempt as a side effect of
// just importing the file's functions. pathToFileURL handles platform-
// specific URL formatting correctly (Windows needs file:///C:/..., a
// manually-built string gets this wrong).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
