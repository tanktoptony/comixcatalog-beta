// fetchEbayComps.js — populates the `market_comps` table from sold eBay
// listings, scoped to issues currently in user_collections.
//
// STATUS: scaffold. The actual eBay API call is stubbed (see fetchSoldListings
// below). When real credentials land (EBAY_APP_ID + EBAY_CERT_ID in
// .env.local), fill in the stub. Everything else — queue construction, title
// parsing, bucketing, upsert — is wired up end-to-end and testable against
// synthetic responses via --dry-run.
//
// IMPORTANT: eBay's free Browse API does NOT return sold listings, only
// active. Two viable paid paths for sold-comp data:
//
//   1. eBay Marketplace Insights API — official, requires application +
//      approval. Returns `lastSoldPrice` and full sale records. This is the
//      target endpoint when the user gets approved.
//
//   2. RapidAPI proxy ("eBay Search Results" or similar) — ~$10-30/mo for
//      enough volume. Wraps eBay's completed-listings page.
//
// Until one of those lands, run with --dry-run to exercise everything except
// the real fetch.
//
// Usage:
//   node scripts/fetchEbayComps.js --dry-run                  → synth data, no DB writes
//   node scripts/fetchEbayComps.js --dry-run --apply          → synth data, DB writes
//   node scripts/fetchEbayComps.js                            → real API + DB writes
//   node scripts/fetchEbayComps.js --limit=50                 → only first 50 issues
//   node scripts/fetchEbayComps.js --max-age-days=14          → skip issues fetched <14d ago

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { parseEbayTitle } from "../src/lib/ebayTitleParser.js";
import { gradeBucket } from "../src/lib/valuation.js";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const DRY_RUN = !!args["dry-run"];
const APPLY = !!args.apply;
const LIMIT = args.limit ? Number(args.limit) : null;
const MAX_AGE_DAYS = args["max-age-days"] ? Number(args["max-age-days"]) : 7;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─────────────────────────────────────────────────────────────────────────
// Queue construction — which (gcd_issue_id, series_title, issue_number)
// tuples do we want comps for?
//
// Priority order:
//   1. Issues currently in user_collections (immediate user value)
//   2. Issues in canonical_covers (known-popular, well-indexed)
//   3. Everything else (deferred)
//
// We only do tier 1 in this scaffold. Tier 2 lands when we expand from
// "things users own" to "things users might own."
// ─────────────────────────────────────────────────────────────────────────

async function buildQueue() {
  console.log("Building comp-fetch queue from user_collections + gcd_issues...");

  // Pull distinct gcd_issue_id values currently in user_collections.
  // Pagination because Supabase caps at 1000.
  const allIds = new Set();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("user_collections")
      .select("gcd_issue_id")
      .not("gcd_issue_id", "is", null)
      .order("gcd_issue_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) allIds.add(Number(row.gcd_issue_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  ${allIds.size} distinct gcd_issue_ids in user_collections`);
  if (allIds.size === 0) return [];

  // Skip issues we've fetched recently. The MAX_AGE_DAYS window means a
  // weekly refresh stays cheap — only issues we haven't touched in a week
  // get re-fetched.
  const sinceIso = new Date(
    Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const recentlyFetched = new Set();
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("market_comps")
      .select("gcd_issue_id")
      .gte("fetched_at", sinceIso)
      .not("gcd_issue_id", "is", null)
      .order("gcd_issue_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) recentlyFetched.add(Number(row.gcd_issue_id));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(
    `  ${recentlyFetched.size} have fresh comps (< ${MAX_AGE_DAYS}d old) — skipping`
  );

  const toFetch = [...allIds].filter((id) => !recentlyFetched.has(id));
  console.log(`  ${toFetch.length} issues to fetch`);
  if (toFetch.length === 0) return [];

  // Now hydrate the issue rows with series info for the eBay query.
  const issues = [];
  for (let i = 0; i < toFetch.length; i += 200) {
    const slice = toFetch.slice(i, i + 200);
    const { data, error } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number")
      .in("gcd_id", slice);
    if (error) throw error;
    issues.push(...(data ?? []));
  }

  const seriesIds = [...new Set(issues.map((i) => i.series_gcd_id).filter(Boolean))];
  const seriesByGcd = new Map();
  for (let i = 0; i < seriesIds.length; i += 200) {
    const slice = seriesIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("series")
      .select("gcd_id, title")
      .in("gcd_id", slice);
    if (error) throw error;
    for (const s of data ?? []) seriesByGcd.set(String(s.gcd_id), s.title);
  }

  const queue = issues
    .map((i) => ({
      gcd_issue_id: i.gcd_id,
      series_title: seriesByGcd.get(String(i.series_gcd_id)) ?? null,
      issue_number: i.issue_number,
    }))
    .filter((q) => q.series_title && q.issue_number != null);

  return LIMIT ? queue.slice(0, LIMIT) : queue;
}

// ─────────────────────────────────────────────────────────────────────────
// eBay sold-listings fetcher — STUB.
//
// Real implementation will hit eBay Marketplace Insights API (or chosen
// proxy) with the search query and filter to "Sold" / "Completed" status,
// 90-day window, US marketplace, condition=USED.
//
// Return shape:
//   [
//     {
//       listing_id: string,        -- eBay item ID, unique
//       title: string,             -- full listing title (will be parsed)
//       sold_price: number,        -- numeric, USD
//       sold_date: string,         -- ISO date "2026-04-15"
//       listing_url: string,       -- canonical eBay URL
//     },
//   ]
//
// For --dry-run, returns synthetic comps that exercise the full pipeline.
// ─────────────────────────────────────────────────────────────────────────

// ── eBay OAuth (client_credentials, application-level token) ──────────
// Two API paths:
//   EBAY_API=insights → Marketplace Insights (sold-comps, requires special
//                        approval beyond the basic developer account)
//   EBAY_API=browse   → Browse API (active listings only, generic scope
//                        every prod app has by default)
// Defaults to "browse" because that's what works without approval.
// Token cached in-process; refreshed on 401.
const EBAY_ENV = (process.env.EBAY_ENV || "sandbox").toLowerCase();
const EBAY_API = (process.env.EBAY_API || "browse").toLowerCase();
const EBAY_HOST = EBAY_ENV === "production" ? "api.ebay.com" : "api.sandbox.ebay.com";
const EBAY_OAUTH_URL = `https://${EBAY_HOST}/identity/v1/oauth2/token`;
const EBAY_INSIGHTS_URL = `https://${EBAY_HOST}/buy/marketplace_insights/v1_beta/item_sales/search`;
const EBAY_BROWSE_URL = `https://${EBAY_HOST}/buy/browse/v1/item_summary/search`;
const EBAY_SCOPE = EBAY_API === "insights"
  ? "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"
  : "https://api.ebay.com/oauth/api_scope";
const COMP_SOURCE_LABEL = EBAY_API === "insights" ? "ebay" : "ebay-listed";

let _ebayTokenCache = { token: null, expiresAt: 0 };

async function getEbayToken() {
  if (_ebayTokenCache.token && Date.now() < _ebayTokenCache.expiresAt - 30_000) {
    return _ebayTokenCache.token;
  }
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing in .env.local");
  }
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_SCOPE,
  }).toString();

  const resp = await fetch(EBAY_OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`eBay OAuth ${resp.status}: ${text}`);
  }
  const json = JSON.parse(text);
  _ebayTokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return _ebayTokenCache.token;
}

// 90-day window for sold-comps. Insights filter syntax:
//   filter=lastSoldDate:[YYYY-MM-DDTHH:MM:SS.000Z..YYYY-MM-DDTHH:MM:SS.000Z]
function soldDateFilter() {
  const now = new Date();
  const ninety = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().split(".")[0] + ".000Z";
  return `lastSoldDate:[${fmt(ninety)}..${fmt(now)}]`;
}

async function fetchSoldListings({ series_title, issue_number }) {
  if (DRY_RUN) {
    // Synth path stays for offline pipeline testing.
    const baseId = `synth-${series_title.replace(/\W/g, "")}-${issue_number}`;
    const today = new Date().toISOString().slice(0, 10);
    return [
      { listing_id: `${baseId}-A`, title: `${series_title} #${issue_number} CGC 9.8 White Pages`, sold_price: 120.0, sold_date: today, listing_url: `https://example.com/listing/${baseId}-A` },
      { listing_id: `${baseId}-B`, title: `${series_title} #${issue_number} CGC 9.6`, sold_price: 75.0, sold_date: today, listing_url: `https://example.com/listing/${baseId}-B` },
      { listing_id: `${baseId}-C`, title: `${series_title} ${issue_number} RAW NM`, sold_price: 30.0, sold_date: today, listing_url: `https://example.com/listing/${baseId}-C` },
    ];
  }

  const token = await getEbayToken();
  // Query: "<series_title> #<issue_number>" scoped to category_ids=63 (Comics).
  // For Insights we also filter by lastSoldDate (90-day window). For Browse
  // there's no sold-date concept — only active listings are returned, so the
  // date filter is omitted and listing freshness is "right now."
  const query = `${series_title} ${issue_number}`;
  const params = new URLSearchParams({
    q: query,
    category_ids: "63",
    limit: "50",
  });
  if (EBAY_API === "insights") params.set("filter", soldDateFilter());
  const url = `${EBAY_API === "insights" ? EBAY_INSIGHTS_URL : EBAY_BROWSE_URL}?${params.toString()}`;

  let resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      Accept: "application/json",
    },
  });

  // One retry on 401 in case token expired between cache check and call.
  if (resp.status === 401) {
    _ebayTokenCache = { token: null, expiresAt: 0 };
    const fresh = await getEbayToken();
    resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${fresh}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        Accept: "application/json",
      },
    });
  }

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`eBay ${EBAY_API} ${resp.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text);

  // Response shapes differ between Insights and Browse.
  //   Insights: { itemSales: [{ itemId, title, lastSoldPrice:{value}, lastSoldDate, itemWebUrl }] }
  //   Browse:   { itemSummaries: [{ itemId, title, price:{value}, itemWebUrl, ... }] }
  // We normalize to our canonical { listing_id, title, sold_price, sold_date, listing_url } shape.
  // For Browse there's no sold_date — listings are active "now," so we stamp today.
  if (EBAY_API === "insights") {
    const sales = json.itemSales ?? [];
    return sales.map((s) => ({
      listing_id: s.itemId,
      title: s.title ?? "",
      sold_price: Number(s.lastSoldPrice?.value ?? 0),
      sold_date: (s.lastSoldDate ?? "").slice(0, 10),
      listing_url: s.itemWebUrl ?? s.itemAffiliateWebUrl ?? null,
    }));
  }

  const summaries = json.itemSummaries ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return summaries.map((s) => ({
    listing_id: s.itemId,
    title: s.title ?? "",
    sold_price: Number(s.price?.value ?? 0),
    sold_date: today,
    listing_url: s.itemWebUrl ?? s.itemAffiliateWebUrl ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Per-issue processing: fetch → parse each listing → filter to matches →
// build market_comps rows.
// ─────────────────────────────────────────────────────────────────────────

function buildCompRows({ gcd_issue_id, series_title, issue_number, listings }) {
  const rows = [];
  for (const listing of listings) {
    const parsed = parseEbayTitle(listing.title);

    // Confidence gate: require a real grade signal. A title with no slab
    // info and no recognizable raw condition can't be bucketed reliably
    // — skip rather than dump it into "Raw Ungraded" with everything else.
    if (parsed.confidence.slab_grade === "none") continue;

    // Issue-number gate: the listing must mention our issue number.
    // Otherwise "Amazing Spider-Man 1 CGC 9.8" comp would land on #300.
    const parsedIssue = String(parsed.issue_guess ?? "").trim();
    const targetIssue = String(issue_number).trim();
    if (parsedIssue !== targetIssue) continue;

    // Grade clamp: CGC scale is 0.5-10.0, stored as numeric(3,1) (max 99.9).
    // Title parser sometimes mis-extracts numbers from titles ("100 ISSUE
    // LOT") as a grade. Drop the bad reading rather than crash the batch.
    let safeGrade = parsed.grade_numeric;
    if (safeGrade != null) {
      const n = Number(safeGrade);
      if (!Number.isFinite(n) || n < 0.5 || n > 10) safeGrade = null;
    }

    // Price sanity: numeric(10,2) tops out at 99,999,999.99 but a comic
    // listing > $50k is almost certainly a parser/data error. Drop those
    // rather than poison the median.
    const safePrice = Number(listing.sold_price);
    if (!Number.isFinite(safePrice) || safePrice <= 0 || safePrice > 50000) continue;

    rows.push({
      gcd_issue_id,
      grade_bucket: parsed.grade_bucket,
      slab_company: parsed.slab_company,
      grade_numeric: safeGrade,
      condition_label: parsed.condition_label,
      sold_price: safePrice,
      sold_currency: "USD",
      sold_date: listing.sold_date,
      source: DRY_RUN ? "dry-run" : COMP_SOURCE_LABEL,
      external_listing_id: String(listing.listing_id),
      listing_url: listing.listing_url ?? null,
      listing_title: listing.title,
    });
  }
  return rows;
}

async function upsertComps(rows) {
  if (rows.length === 0) return { upserted: 0 };
  if (DRY_RUN && !APPLY) return { upserted: 0, skipped_write: true };

  // Try a batch upsert first — fastest path. If it fails (one bad row
  // poisons the whole batch under PostgREST), fall back to per-row so
  // good rows still get through.
  const { error: batchErr, count } = await supabase
    .from("market_comps")
    .upsert(rows, { onConflict: "source,external_listing_id", count: "exact" });
  if (!batchErr) return { upserted: count ?? rows.length };

  // Per-row fallback. Slow but resilient.
  let ok = 0, bad = 0;
  for (const row of rows) {
    const { error } = await supabase
      .from("market_comps")
      .upsert([row], { onConflict: "source,external_listing_id" });
    if (error) {
      bad++;
      if (bad <= 3) {
        console.warn(`  upsert skipped (${error.code}): ${row.listing_title?.slice(0, 60)}`);
      }
    } else ok++;
  }
  return { upserted: ok, skipped: bad };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function run() {
  console.log("=== fetchEbayComps ===");
  console.log(`  dry-run:        ${DRY_RUN}`);
  console.log(`  apply (writes): ${APPLY || !DRY_RUN}`);
  console.log(`  env:            ${EBAY_ENV}`);
  console.log(`  api:            ${EBAY_API}  (source label: ${COMP_SOURCE_LABEL})`);
  console.log(`  limit:          ${LIMIT ?? "(none)"}`);
  console.log(`  max-age-days:   ${MAX_AGE_DAYS}`);
  console.log();

  const queue = await buildQueue();
  if (queue.length === 0) {
    console.log("Nothing to fetch. Exiting.");
    return;
  }
  console.log(`Processing ${queue.length} issue(s)...\n`);

  let totalListings = 0;
  let totalRows = 0;
  let totalUpserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const label = `[${i + 1}/${queue.length}] ${item.series_title} #${item.issue_number}`;

    let listings = [];
    try {
      listings = await fetchSoldListings(item);
    } catch (err) {
      console.log(`  ${label} — fetch failed: ${err.message}`);
      totalFailed += 1;
      if (!DRY_RUN) break; // real-API failure usually means auth/rate issues; bail
      continue;
    }

    const rows = buildCompRows({
      gcd_issue_id: item.gcd_issue_id,
      series_title: item.series_title,
      issue_number: item.issue_number,
      listings,
    });

    totalListings += listings.length;
    totalRows += rows.length;

    const { upserted, skipped_write } = await upsertComps(rows);
    if (skipped_write) {
      console.log(`  ${label} — ${listings.length} listings, ${rows.length} valid comps (no write, dry-run)`);
    } else {
      console.log(`  ${label} — ${listings.length} listings, ${rows.length} valid, ${upserted} upserted`);
      totalUpserted += upserted;
    }
  }

  console.log("\n══════ DONE ══════");
  console.log(`  issues processed:   ${queue.length - totalFailed}/${queue.length}`);
  console.log(`  listings fetched:   ${totalListings}`);
  console.log(`  valid comp rows:    ${totalRows}`);
  console.log(`  upserted to DB:     ${totalUpserted}`);
  if (totalFailed) console.log(`  failed:             ${totalFailed}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
