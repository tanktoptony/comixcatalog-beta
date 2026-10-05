// Daily(ish) snapshot of every user's collection value, into
// collection_value_history — see scripts/migrations/0025_collection_value_history.sql
// for why this table exists (a value-over-time graph needs a history, and
// the only way to have "30 days ago" a month from now is to start today).
//
// Each copy is valued by valueFromComps() in src/lib/compValue.js, the same
// function src/lib/marketValue.js uses for /library and public profiles, so
// the number stored here matches what the user sees. This script used to
// carry a hand-copied version of that logic, kept in step only by a comment,
// so it now imports the shared one (relative path, no Next alias).
//
// A user's own market_value override still wins, and a copy with no
// gcd_issue_id gets no comps, only the cover-price floor where one applies,
// same as the live UI.
//
// Usage:
//   node scripts/snapshotCollectionValue.js            # snapshot all users, write to DB
//   node scripts/snapshotCollectionValue.js --dry-run   # compute + print, no writes

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { valueFromComps, issueYearFrom } from "../src/lib/compValue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE = 1000;
const CHUNK = 200;
const WINDOW_DAYS = 90; // matches DEFAULT_WINDOW_DAYS in src/lib/marketValue.js

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

async function fetchByIds(table, columns, idColumn, ids, extra = (q) => q) {
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    rows.push(...(await fetchAllPages(() => extra(supabase.from(table).select(columns).in(idColumn, chunk)), idColumn === "gcd_id" ? "gcd_id" : "id")));
  }
  return rows;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

async function run() {
  console.log("Loading owned collection rows...");
  const owned = await fetchAllPages(
    () =>
      supabase
        .from("user_collections")
        .select("id, user_id, gcd_issue_id, market_value, grade_numeric, slab_company, condition")
        // Listed books are still owned until they sell.
        .in("status", ["owned", "for_sale"]),
    "id"
  );
  console.log(`Owned rows: ${owned.length}`);

  const gcdIssueIds = [...new Set(owned.map((r) => r.gcd_issue_id).filter((v) => v != null))];
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const issues = await fetchByIds("gcd_issues", "gcd_id, series_gcd_id, key_date, publication_date", "gcd_id", gcdIssueIds);
  const issueById = new Map(issues.map((r) => [Number(r.gcd_id), r]));
  const seriesIds = [...new Set(issues.map((r) => r.series_gcd_id).filter((v) => v != null))];
  const series = await fetchByIds("series", "id, gcd_id, title, year_start_cached", "gcd_id", seriesIds);
  const seriesById = new Map(series.map((r) => [Number(r.gcd_id), r]));
  console.log(`Resolved ${issueById.size} distinct issues across ${seriesById.size} series.`);

  const comps = await fetchByIds(
    "market_comps",
    "id, gcd_issue_id, grade_bucket, grade_numeric, sold_price, sold_date, source, listing_title",
    "gcd_issue_id",
    gcdIssueIds,
    (q) => q.gte("sold_date", sinceIso)
  );
  const compsByIssue = new Map();
  for (const row of comps) {
    const key = Number(row.gcd_issue_id);
    if (!compsByIssue.has(key)) compsByIssue.set(key, []);
    compsByIssue.get(key).push(row);
  }
  console.log(`Loaded ${comps.length} comps in the ${WINDOW_DAYS}-day window.`);

  const valueById = new Map();
  for (const item of owned) {
    const userValue = Number(item.market_value);
    if (Number.isFinite(userValue) && userValue > 0) {
      valueById.set(item.id, userValue);
      continue;
    }
    const issueRow = issueById.get(Number(item.gcd_issue_id));
    const seriesRow = issueRow ? seriesById.get(Number(issueRow.series_gcd_id)) : null;
    const result = valueFromComps({
      comps: compsByIssue.get(Number(item.gcd_issue_id)) ?? [],
      item,
      issue: {
        seriesTitle: seriesRow?.title ?? null,
        issueYear: issueYearFrom(issueRow),
        seriesStartYear: seriesRow?.year_start_cached ?? null,
      },
    });
    valueById.set(item.id, result.value ?? 0);
  }

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
