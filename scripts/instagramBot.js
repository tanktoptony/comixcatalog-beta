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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const LEDGER_PATH = path.resolve(__dirname, ".instagram-posted.json");

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

function hashtagsFor(publisher, year) {
  const decade = year ? `${Math.floor(year / 10) * 10}s` : null;
  const pubTag = publisher
    ? publisher.toLowerCase().replace(/[^a-z0-9]/g, "")
    : null;
  return ["#comics", "#keyissues", "#comicbooks", pubTag && `#${pubTag}`, decade && `#${decade}comics`]
    .filter(Boolean)
    .join(" ");
}

export function buildCaption({ title, issueNumber, year, publisher, valueLine, kicker }) {
  const header = `${title}${issueNumber ? ` #${issueNumber}` : ""}${year ? ` (${year})` : ""}`;
  const lines = [kicker, header, publisher, valueLine, "", "Catalogued on ComixCatalog — link in bio", hashtagsFor(publisher, year)]
    .filter((l) => l !== undefined && l !== null);
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
      .select("gcd_issue_id, issue_number")
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
    };
  }
  return null;
}

// ── Content type 2: New to the Catalog — most recent resolved cover add ────
export async function pickNewToCatalog(seenKeys) {
  const { data } = await supabase
    .from("canonical_covers")
    .select("gcd_issue_id, series_title, issue_number, series_year, publisher, storage_path, created_at")
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
      .select("series_title, issue_number, series_year, publisher, storage_path")
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
    };
  }
  return null;
}

async function selectPost() {
  const seenKeys = loadLedger();
  // Rotate types by day-of-year so it's not random-feeling day to day.
  const dayIndex = Math.floor(Date.now() / 86400000) % 3;
  const pickers = [pickCoverSpotlight, pickNewToCatalog, pickValueCheck];
  const order = [...pickers.slice(dayIndex), ...pickers.slice(0, dayIndex)];
  for (const picker of order) {
    const post = await picker(seenKeys);
    if (post) return post;
  }
  return null;
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
  const createJson = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    throw new Error(`Media container creation failed: ${JSON.stringify(createJson)}`);
  }

  const publishRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish?` +
      new URLSearchParams({ creation_id: createJson.id, access_token: token }),
    { method: "POST" }
  );
  const publishJson = await publishRes.json();
  if (!publishRes.ok || !publishJson.id) {
    throw new Error(`Publish failed: ${JSON.stringify(publishJson)}`);
  }
  return publishJson.id;
}

async function run() {
  const post = await selectPost();
  if (!post) {
    console.log("No eligible content found (ledger may have exhausted all candidates).");
    return;
  }

  const kicker = { "Cover Spotlight": "✦ Cover Spotlight", "New to the Catalog": "✦ New to the Catalog", "Key Issue Value Check": "✦ Value Check" }[post.type];
  const valueLine = post.valueInfo
    ? `Est. value (raw NM-ish, ${post.valueInfo.sampleSize} sales): $${post.valueInfo.value.toFixed(0)}`
    : post.type === "Key Issue Value Check"
      ? null
      : (() => {
          const floor = coverPriceForYear(post.year);
          return floor ? `Est. cover-price floor: $${floor.toFixed(2)}` : null;
        })();

  const caption = buildCaption({
    title: post.title,
    issueNumber: post.issueNumber,
    year: post.year,
    publisher: post.publisher,
    valueLine,
    kicker,
  });

  console.log(`Selected: ${post.type} — ${post.title} #${post.issueNumber} (${post.year ?? "?"})`);
  console.log(`Image: ${post.imageUrl}`);
  console.log(`Caption:\n${caption}\n`);

  if (DRY_RUN) {
    console.log("[dry-run] Not posting.");
    return;
  }

  const publishedId = await postToInstagram({ imageUrl: post.imageUrl, caption });
  appendLedger(post.dedupeKey);
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
