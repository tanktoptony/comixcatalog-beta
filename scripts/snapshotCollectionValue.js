// Daily(ish) snapshot of every user's collection value, into
// collection_value_history — see scripts/migrations/0025_collection_value_history.sql
// for why this table exists (a value-over-time graph needs a history, and
// the only way to have "30 days ago" a month from now is to start today).
//
// Value computation deliberately mirrors src/lib/marketValue.js's
// getMarketValue() exactly — same bucket-fallback chain against
// market_comps, same cover-price floor, same "no gcd_issue_id means zero"
// behavior — so the number this stores matches what /library actually
// shows a user right now. It's duplicated rather than imported because
// marketValue.js pulls in `@/lib/valuation` (a Next.js path alias) that
// doesn't resolve from a raw `node scripts/...` invocation — same
// constraint noted on src/lib/ebayTitleParser.js. gradeBucket/
// bucketFallbacks/median/coverPriceForYear ARE imported directly (relative
// path) since valuation.js has no such alias dependency itself.
//
// Usage:
//   node scripts/snapshotCollectionValue.js            # snapshot all users, write to DB
//   node scripts/snapshotCollectionValue.js --dry-run   # compute + print, no writes

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { gradeBucket, bucketFallbacks, median, coverPriceForYear } from "../src/lib/valuation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE = 1000;
const WINDOW_DAYS = 90; // matches DEFAULT_WINDOW_DAYS in src/lib/marketValue.js
const MIN_SAMPLES = 3; // matches MIN_SAMPLES in src/lib/marketValue.js
const MAX_SAMPLES_TO_CONSIDER = 50;
const CONCURRENCY = 8;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TRANSIENT_CODES = new Set(["57014", "53300", "PGRST116", "ETIMEDOUT"]);
async function runWithRetry(label, thunk, maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await thunk();
    if (!error) return data;
    const code = error.code || "";
    const msg = (error.message || "").toLowerCase();
    const transient = TRANSIENT_CODES.has(code) || msg.includes("timeout") || msg.includes("fetch failed") || msg.includes("network") || msg === "";
    lastError = error;
    if (!transient || attempt === maxAttempts) throw error;
    const backoffMs = [1000, 3000, 8000][attempt - 1] ?? 8000;
    console.error(`  ⚠ ${label} transient error (attempt ${attempt}/${maxAttempts}): ${error.message || error.code || "unknown"} — retrying in ${backoffMs}ms`);
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw lastError;
}

// PostgREST silently caps any query without .range() at 1000 rows — this
// repo has been bitten by that more than once (refreshSeriesSearchCache.js,
// generateCoverGapTargets.js). Always paginate.
async function fetchAllPages(build, orderCol) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await runWithRetry(`page (from=${from})`, () => build().order(orderCol).range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

// gcd_issues.publication_date is null on ~65% of rows — key_date is GCD's
// sortable fallback. Same helper as scripts/refreshSeriesSearchCache.js.
function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}
function bestYearFor(row) {
  return parseYear(row.publication_date) ?? parseYear(row.key_date);
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

// Mirrors getMarketValue() in src/lib/marketValue.js exactly, including its
// gcd_issue_id == null short-circuit — a local (comic_id-based) collection
// item with no GCD link gets $0 here today too, matching what the live UI
// would show it. Not "fixing" that gap silently as a side effect of this
// script; it's a real but separate, pre-existing behavior worth revisiting
// on its own if it turns out to matter (currently ~140 local comics
// site-wide per CLAUDE.md, low overlap expected with owned rows).
async function computeItemValue({ gcd_issue_id, market_value, grade_numeric, slab_company, condition, release_year }) {
  const userValue = Number(market_value);
  if (Number.isFinite(userValue) && userValue > 0) return userValue;

  if (gcd_issue_id == null) return 0;

  const primaryBucket = gradeBucket({ grade_numeric, slab_company, condition });
  const tryBuckets = bucketFallbacks(primaryBucket);
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const candidate of tryBuckets) {
    const { data, error } = await supabase
      .from("market_comps")
      .select("sold_price")
      .eq("gcd_issue_id", Number(gcd_issue_id))
      .eq("grade_bucket", candidate)
      .gte("sold_date", sinceIso)
      .order("sold_date", { ascending: false })
      .limit(MAX_SAMPLES_TO_CONSIDER);
    if (error) {
      console.error(`  ⚠ market_comps lookup failed for gcd_issue_id=${gcd_issue_id}, bucket=${candidate}:`, error.message || error);
      continue;
    }
    if ((data?.length ?? 0) >= MIN_SAMPLES) {
      const value = median(data.map((r) => Number(r.sold_price)));
      return value != null ? roundCurrency(value) : 0;
    }
  }

  const cover = coverPriceForYear(release_year);
  return cover != null ? cover : 0;
}

async function run() {
  console.log("Loading owned collection rows...");
  const owned = await fetchAllPages(
    () =>
      supabase
        .from("user_collections")
        .select("id, user_id, gcd_issue_id, market_value, grade_numeric, slab_company, condition")
        .eq("status", "owned"),
    "id"
  );
  console.log(`Owned rows: ${owned.length}`);

  const gcdIssueIds = [...new Set(owned.map((r) => r.gcd_issue_id).filter((v) => v != null))];
  const yearByGcdId = new Map();
  const ISSUE_CHUNK = 500;
  for (let i = 0; i < gcdIssueIds.length; i += ISSUE_CHUNK) {
    const chunk = gcdIssueIds.slice(i, i + ISSUE_CHUNK);
    const rows = await runWithRetry(`gcd_issues chunk ${i}`, () =>
      supabase.from("gcd_issues").select("gcd_id, publication_date, key_date").in("gcd_id", chunk)
    );
    for (const row of rows) yearByGcdId.set(row.gcd_id, bestYearFor(row));
  }
  console.log(`Resolved years for ${yearByGcdId.size} distinct issues.`);

  console.log("Computing per-item values (this hits market_comps per unpriced item)...");
  const valueById = new Map();
  let i = 0;
  async function worker() {
    while (i < owned.length) {
      const idx = i++;
      const item = owned[idx];
      const release_year = item.gcd_issue_id != null ? yearByGcdId.get(item.gcd_issue_id) ?? null : null;
      try {
        const value = await computeItemValue({ ...item, release_year });
        valueById.set(item.id, value);
      } catch (err) {
        console.error(`  ⚠ value computation failed for collection row ${item.id}:`, err.message || err);
        valueById.set(item.id, 0);
      }
      if ((idx + 1) % 200 === 0) console.log(`  ...${idx + 1}/${owned.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, owned.length) }, worker));

  const byUser = new Map(); // user_id -> { totalValue, ownedCount }
  for (const item of owned) {
    const entry = byUser.get(item.user_id) ?? { totalValue: 0, ownedCount: 0 };
    entry.totalValue += valueById.get(item.id) ?? 0;
    entry.ownedCount += 1;
    byUser.set(item.user_id, entry);
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const rowsToUpsert = [...byUser.entries()].map(([user_id, { totalValue, ownedCount }]) => ({
    user_id,
    snapshot_date: snapshotDate,
    total_value: roundCurrency(totalValue),
    owned_count: ownedCount,
  }));

  console.log(`\nUsers with owned items: ${rowsToUpsert.length}`);
  console.log(`Site-wide total value (sum across all users): $${roundCurrency(rowsToUpsert.reduce((s, r) => s + r.total_value, 0)).toLocaleString()}`);
  console.log(`Snapshot date: ${snapshotDate}`);

  if (DRY_RUN) {
    console.log("\n[dry-run] Sample rows (first 10):");
    console.log(rowsToUpsert.slice(0, 10));
    console.log("\n[dry-run] No writes performed.");
    return;
  }

  if (rowsToUpsert.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  const UPSERT_CHUNK = 500;
  for (let from = 0; from < rowsToUpsert.length; from += UPSERT_CHUNK) {
    const chunk = rowsToUpsert.slice(from, from + UPSERT_CHUNK);
    const { error } = await supabase.from("collection_value_history").upsert(chunk, { onConflict: "user_id,snapshot_date" });
    if (error) {
      console.error(`Upsert failed for chunk starting at ${from}:`, error);
      process.exit(1);
    }
  }
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
