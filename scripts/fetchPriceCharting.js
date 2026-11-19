// fetchPriceCharting.js: price our comics from PriceCharting's API into
// pricecharting_prices (migration 0105), linked to GCD issues.
//
// PriceCharting has no comics CSV (the Legendary download page offers video
// games and card categories only), so this searches the API once per base
// GCD issue. One /api/products search ("Uncanny X-Men 266") returns up to 20
// products with full prices: the base book, its newsstand and other variants.
// scripts/lib/priceCharting.js links them (tested): same series name, issue
// number, year within 1, and a bracketed variant only to the GCD variant of
// the same name.
//
// Queue, in order: base issues in member collections and wantlists, then key
// issues. pricecharting_searches (migration 0106) records each search, and
// issues searched within --max-age-days are skipped. The API allows one call
// per second ("Any more than that and your calls will be blocked"), so calls
// are spaced 1.1 s apart and --max-calls caps a run.
//
// Usage:
//   node scripts/fetchPriceCharting.js                      dry run, 20 searches, prints links
//   node scripts/fetchPriceCharting.js --apply              write
//   node scripts/fetchPriceCharting.js --apply --max-calls=3000 --max-age-days=7
//   node scripts/fetchPriceCharting.js --ids=48391,44451    only these issues (ignores max age)
//
// Env: PRICECHARTING_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { linkSearchResults, searchQuery } from "./lib/priceCharting.js";
import { withRetry } from "./lib/withRetry.js";
import { describeError } from "./lib/describeError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  })
);
const APPLY = !!args.apply;
const MAX_CALLS = Number(args["max-calls"] ?? (APPLY ? 3000 : 20));
const MAX_AGE_DAYS = Number(args["max-age-days"] ?? 7);
const ONLY_IDS = args.ids ? String(args.ids).split(",").map(Number).filter(Boolean) : null;
const CALL_GAP_MS = 1100;
const FLUSH_EVERY = 50;
const PAGE = 1000;
const API = "https://www.pricecharting.com/api/products";

const TOKEN = process.env.PRICECHARTING_TOKEN;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunked(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function readAllKeyset(label, build, keyCol) {
  const rows = [];
  let last = null;
  for (;;) {
    const page = await withRetry(label, () => {
      let q = build().order(keyCol, { ascending: true }).limit(PAGE);
      if (last != null) q = q.gt(keyCol, last);
      return q;
    });
    rows.push(...(page ?? []));
    if (!page || page.length < PAGE) return rows;
    last = page[page.length - 1][keyCol];
  }
}

const ISSUE_COLS = "gcd_id, series_gcd_id, issue_number, key_date, publication_date, variant_of_gcd_id, variant_name";

async function issuesById(ids) {
  const out = new Map();
  for (const chunk of chunked([...new Set(ids)], 300)) {
    const rows = await withRetry("gcd_issues by id", () => supabase.from("gcd_issues").select(ISSUE_COLS).in("gcd_id", chunk).limit(PAGE));
    for (const r of rows ?? []) out.set(Number(r.gcd_id), r);
  }
  return out;
}

async function buildQueue() {
  let ordered;
  if (ONLY_IDS) {
    ordered = ONLY_IDS;
  } else {
    const coll = await readAllKeyset(
      "user_collections",
      () => supabase.from("user_collections").select("id, gcd_issue_id, notes").not("gcd_issue_id", "is", null),
      "id"
    );
    // audit-seed-1119: test rows on a test account, not real books.
    const collIds = coll.filter((r) => r.notes !== "audit-seed-1119").map((r) => Number(r.gcd_issue_id));
    const keys = await readAllKeyset("key_issues", () => supabase.from("key_issues").select("id, gcd_issue_id").not("gcd_issue_id", "is", null), "id");
    ordered = [...collIds, ...keys.map((k) => Number(k.gcd_issue_id))];
  }

  // Collapse variants to their base: one search covers base and variants.
  const rows = await issuesById(ordered);
  const bases = [];
  const seen = new Set();
  for (const id of ordered) {
    const r = rows.get(id);
    if (!r) continue;
    const base = Number(r.variant_of_gcd_id ?? r.gcd_id);
    if (seen.has(base)) continue;
    seen.add(base);
    bases.push(base);
  }

  let fresh = new Set();
  if (!ONLY_IDS) {
    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString();
    const recent = await readAllKeyset(
      "recent searches",
      () => supabase.from("pricecharting_searches").select("gcd_issue_id").gte("searched_at", cutoff),
      "gcd_issue_id"
    );
    fresh = new Set(recent.map((r) => Number(r.gcd_issue_id)));
  }
  const due = bases.filter((b) => !fresh.has(b));
  console.log(`Queue: ${bases.length} base issues, ${bases.length - due.length} searched in the last ${MAX_AGE_DAYS} days, ${due.length} due`);
  return due;
}

let lastCall = 0;
async function searchProducts(q) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const wait = lastCall + CALL_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    let res;
    let body;
    try {
      res = await fetch(`${API}?t=${encodeURIComponent(TOKEN)}&q=${encodeURIComponent(q)}`);
      body = await res.json().catch(() => null);
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(5000 * attempt);
      continue;
    }
    if (res.ok && body?.status === "success") return body.products ?? [];
    const message = body?.["error-message"] ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403 || /token/i.test(message)) throw new Error(`PriceCharting refused the token: ${message}`);
    if (attempt === 4) throw new Error(`PriceCharting search failed for "${q}": ${message}`);
    // 429 or 5xx: back off well past the 1/s limit before trying again.
    await sleep(10000 * attempt);
  }
  return [];
}

async function main() {
  if (!TOKEN) throw new Error("PRICECHARTING_TOKEN is not set");
  const startedAt = Date.now();
  const due = (await buildQueue()).slice(0, MAX_CALLS);
  if (due.length === 0) return console.log("Nothing due.");

  const baseRows = await issuesById(due);
  const seriesIds = [...new Set([...baseRows.values()].map((r) => Number(r.series_gcd_id)))];
  const seriesName = new Map();
  for (const chunk of chunked(seriesIds, 300)) {
    const rows = await withRetry("gcd_series", () => supabase.from("gcd_series").select("gcd_id, name").in("gcd_id", chunk).limit(PAGE));
    for (const s of rows ?? []) seriesName.set(Number(s.gcd_id), s.name);
  }
  const variantsByBase = new Map();
  for (const chunk of chunked(due, 200)) {
    const rows = await readAllKeyset("variants", () => supabase.from("gcd_issues").select(ISSUE_COLS).in("variant_of_gcd_id", chunk), "gcd_id");
    for (const v of rows) {
      const b = Number(v.variant_of_gcd_id);
      if (!variantsByBase.has(b)) variantsByBase.set(b, []);
      variantsByBase.get(b).push(v);
    }
  }

  let calls = 0;
  let baseLinkedCount = 0;
  let rowsLinked = 0;
  let pendingRows = [];
  let pendingSearches = [];

  async function flush() {
    if (!APPLY) { pendingRows = []; pendingSearches = []; return; }
    const byId = new Map(pendingRows.map((r) => [r.pc_id, { ...r, updated_at: new Date().toISOString() }]));
    if (byId.size) await withRetry("upsert prices", () => supabase.from("pricecharting_prices").upsert([...byId.values()], { onConflict: "pc_id" }));
    if (pendingSearches.length) await withRetry("upsert searches", () => supabase.from("pricecharting_searches").upsert(pendingSearches, { onConflict: "gcd_issue_id" }));
    pendingRows = [];
    pendingSearches = [];
  }

  for (let i = 0; i < due.length; i += 1) {
    const baseId = due[i];
    const base = baseRows.get(baseId);
    const name = base && seriesName.get(Number(base.series_gcd_id));
    if (!base || !name || !base.issue_number) {
      pendingSearches.push({ gcd_issue_id: baseId, searched_at: new Date().toISOString(), products_found: 0, linked: 0 });
      continue;
    }
    const variants = variantsByBase.get(baseId) ?? [];
    let products = await searchProducts(searchQuery({ seriesName: name, issueNumber: base.issue_number }));
    calls += 1;
    let result = linkSearchResults({ products, base, variants, seriesName: name });
    // A full page without our book: popular numbers (#1) crowd it out. Retry
    // with the year, which PriceCharting puts in every comic's name.
    const year = Number(String(base.key_date ?? base.publication_date ?? "").slice(0, 4));
    if (!result.baseLinked && products.length >= 20 && year > 1800) {
      const more = await searchProducts(searchQuery({ seriesName: name, issueNumber: base.issue_number, year }));
      calls += 1;
      products = [...products, ...more];
      result = linkSearchResults({ products, base, variants, seriesName: name });
    }
    if (result.baseLinked) baseLinkedCount += 1;
    rowsLinked += result.rows.length;
    pendingRows.push(...result.rows);
    pendingSearches.push({ gcd_issue_id: baseId, searched_at: new Date().toISOString(), products_found: products.length, linked: result.rows.length });
    if (!APPLY) {
      const links = result.rows.map((r) => `${r.product_name} -> ${r.gcd_issue_id} (raw $${((r.prices.ungraded ?? 0) / 100).toFixed(2)})`).join("; ");
      console.log(`${name} #${base.issue_number}: ${links || "no link"}`);
    }
    if ((i + 1) % FLUSH_EVERY === 0) {
      await flush();
      const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
      console.log(`  ${i + 1}/${due.length} searched, base book priced for ${baseLinkedCount}, ${rowsLinked} products linked, ${mins} min`);
    }
  }
  await flush();

  const pct = due.length ? ((baseLinkedCount / due.length) * 100).toFixed(1) : "0";
  console.log(`Done: ${due.length} issues, ${calls} API calls, base book priced for ${baseLinkedCount} (${pct}%), ${rowsLinked} products linked including variants, ${Math.round((Date.now() - startedAt) / 1000)}s${APPLY ? "" : " (dry run, nothing written)"}`);
}

main().catch((error) => {
  console.error(`fetchPriceCharting failed: ${describeError(error)}`);
  process.exit(1);
});
