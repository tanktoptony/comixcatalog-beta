// fetchPriceCharting.js: load PriceCharting's comic price guide into
// pricecharting_prices (migration 0105), linked to GCD issues.
//
// One CSV download per run (Legendary subscription; PriceCharting regenerates
// it every 24 hours and allows one download per 10 minutes). Each comic
// product is parsed and linked to a GCD issue by series name, issue number,
// year and variant (scripts/lib/priceCharting.js, tested). If the CSV carries
// a comics.org id column, that wins, since GCD ids are comics.org ids.
//
// Only rows whose prices or link changed are written, so a daily run does
// not rewrite the whole table (the database is small; see playbook ops).
//
// Usage:
//   node scripts/fetchPriceCharting.js                    dry run: download, link, report
//   node scripts/fetchPriceCharting.js --apply            write changes
//   node scripts/fetchPriceCharting.js --file=guide.csv   use a saved CSV instead of downloading
//   node scripts/fetchPriceCharting.js --save=guide.csv   keep the downloaded CSV
//
// Env: PRICECHARTING_TOKEN (40 chars, PriceCharting > Subscriptions >
// API/Download), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// PRICECHARTING_CSV_URL overrides the download URL; "{token}" in it is
// replaced with the token.

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import {
  parseProduct,
  matchProduct,
  pricesFromRow,
  gcdNameCandidates,
  normalizeSeriesName,
  normalizeIssueNumber,
  rowHash,
} from "./lib/priceCharting.js";
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
const PAGE = 1000;
const WRITE_BATCH = 500;
// Never prune when today's file links far fewer products than are stored:
// that is a bad download or a matcher regression, not 30% of comics vanishing.
const PRUNE_MIN_RATIO = 0.9;

const DEFAULT_CSV_URL = "https://www.pricecharting.com/price-guide/download-custom?t={token}&category=comic-books";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

async function loadCsvText() {
  if (args.file) return fs.readFileSync(String(args.file), "utf8");
  const token = process.env.PRICECHARTING_TOKEN;
  if (!token) throw new Error("PRICECHARTING_TOKEN is not set");
  const url = (process.env.PRICECHARTING_CSV_URL || DEFAULT_CSV_URL).replace("{token}", encodeURIComponent(token));
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  if (!res.ok) {
    // Never print the URL: it carries the token.
    throw new Error(`CSV download failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  if (args.save) fs.writeFileSync(String(args.save), text);
  return text;
}

function findGcdIdColumn(fields) {
  return fields.find((f) => /comic.?s?.?org|comicsorg|gcd/i.test(f)) ?? null;
}

async function main() {
  const startedAt = Date.now();
  const text = await loadCsvText();
  const parsedCsv = Papa.parse(text, { header: true, skipEmptyLines: true });
  const fields = parsedCsv.meta.fields ?? [];
  if (!fields.includes("id") || !fields.includes("product-name") || !fields.includes("console-name")) {
    throw new Error(`Unexpected CSV header: ${fields.join(", ").slice(0, 500)}`);
  }
  const gcdCol = findGcdIdColumn(fields);
  console.log(`CSV: ${parsedCsv.data.length} rows, ${fields.length} columns${gcdCol ? `, comics.org id column "${gcdCol}"` : ", no comics.org id column"}`);
  console.log(`Columns: ${fields.join(", ")}`);

  const products = [];
  let notComic = 0;
  let unparsed = 0;
  for (const row of parsedCsv.data) {
    const parsed = parseProduct({
      productName: row["product-name"],
      consoleName: row["console-name"],
      releaseDate: row["release-date"],
    });
    if (!parsed) {
      if (String(row["console-name"] ?? "").startsWith("Comic Books ")) unparsed += 1;
      else notComic += 1;
      continue;
    }
    const pcId = Number(row.id);
    if (!Number.isFinite(pcId)) continue;
    const gcdHint = gcdCol ? Number(String(row[gcdCol] ?? "").replace(/\D/g, "")) || null : null;
    products.push({ pcId, row, parsed, gcdHint });
  }
  console.log(`Comic products: ${products.length} (skipped ${notComic} non-comic, ${unparsed} comic names that didn't parse)`);

  // 1. comics.org id from the CSV, when present and real.
  const linked = new Map(); // pcId -> { gcd_issue_id, method }
  const hinted = products.filter((p) => p.gcdHint);
  if (hinted.length) {
    const known = new Set();
    for (const ids of chunked([...new Set(hinted.map((p) => p.gcdHint))], 300)) {
      const data = await withRetry("gcd id check", () => supabase.from("gcd_issues").select("gcd_id").in("gcd_id", ids).limit(PAGE));
      for (const r of data ?? []) known.add(Number(r.gcd_id));
    }
    for (const p of hinted) if (known.has(p.gcdHint)) linked.set(p.pcId, { gcd_issue_id: p.gcdHint, method: "comics-org-id" });
  }

  // 2. Name, number, year, variant for the rest.
  const rest = products.filter((p) => !linked.has(p.pcId));
  const seriesNames = [...new Set(rest.map((p) => p.parsed.seriesName))];
  const seriesIdsByNorm = new Map();
  for (const names of chunked(seriesNames, 100)) {
    const candidates = names.flatMap(gcdNameCandidates);
    const rows = await readAllKeyset("gcd_series by name", () => supabase.from("gcd_series").select("gcd_id, name").in("name", candidates), "gcd_id");
    for (const s of rows) {
      const norm = normalizeSeriesName(s.name);
      if (!seriesIdsByNorm.has(norm)) seriesIdsByNorm.set(norm, new Set());
      seriesIdsByNorm.get(norm).add(Number(s.gcd_id));
    }
  }

  // Issue numbers each GCD series needs, then one read per chunk of series.
  const numbersBySeries = new Map();
  for (const p of rest) {
    for (const sid of seriesIdsByNorm.get(p.parsed.seriesNorm) ?? []) {
      if (!numbersBySeries.has(sid)) numbersBySeries.set(sid, new Set());
      numbersBySeries.get(sid).add(p.parsed.issueNumber);
    }
  }
  const issuesBySeries = new Map();
  const seriesIds = [...numbersBySeries.keys()];
  for (const ids of chunked(seriesIds, 40)) {
    const numbers = new Set();
    for (const sid of ids) for (const n of numbersBySeries.get(sid)) numbers.add(n);
    // GCD stores some numbers zero-padded; ask for both spellings.
    const asked = new Set(numbers);
    for (const n of numbers) if (/^\d+$/.test(n)) { asked.add(n.padStart(2, "0")); asked.add(n.padStart(3, "0")); }
    for (const nums of chunked([...asked], 250)) {
      const rows = await readAllKeyset(
        "gcd_issues by series",
        () => supabase
          .from("gcd_issues")
          .select("gcd_id, series_gcd_id, issue_number, key_date, publication_date, variant_of_gcd_id, variant_name")
          .in("series_gcd_id", ids)
          .in("issue_number", nums),
        "gcd_id"
      );
      for (const r of rows) {
        const sid = Number(r.series_gcd_id);
        if (!issuesBySeries.has(sid)) issuesBySeries.set(sid, []);
        issuesBySeries.get(sid).push(r);
      }
    }
  }

  const reasons = {};
  const unmatchedBySeries = new Map();
  for (const p of rest) {
    const want = normalizeIssueNumber(p.parsed.issueNumber);
    const issues = [];
    for (const sid of seriesIdsByNorm.get(p.parsed.seriesNorm) ?? []) {
      for (const i of issuesBySeries.get(sid) ?? []) if (normalizeIssueNumber(i.issue_number) === want) issues.push(i);
    }
    const hasSeries = seriesIdsByNorm.has(p.parsed.seriesNorm);
    const result = hasSeries ? matchProduct(p.parsed, issues) : { reason: "no-gcd-series" };
    if (result.gcd_issue_id) {
      linked.set(p.pcId, result);
    } else {
      reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
      unmatchedBySeries.set(p.parsed.seriesName, (unmatchedBySeries.get(p.parsed.seriesName) ?? 0) + 1);
    }
  }

  const methods = {};
  for (const v of linked.values()) methods[v.method] = (methods[v.method] ?? 0) + 1;
  const pct = products.length ? ((linked.size / products.length) * 100).toFixed(1) : "0";
  console.log(`Linked ${linked.size} of ${products.length} comic products (${pct}%): ${JSON.stringify(methods)}`);
  console.log(`Not linked: ${JSON.stringify(reasons)}`);
  const topMissing = [...unmatchedBySeries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.log(`Most unlinked series: ${topMissing.map(([n, c]) => `${n} (${c})`).join("; ")}`);

  // Build rows; drop products with no price at all.
  const rows = [];
  for (const p of products) {
    const link = linked.get(p.pcId);
    if (!link) continue;
    const prices = pricesFromRow(p.row);
    if (Object.keys(prices).length === 0) continue;
    const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(p.row["release-date"] ?? "")) ? p.row["release-date"] : null;
    const salesVolume = Number(p.row["sales-volume"]);
    const out = {
      pc_id: p.pcId,
      gcd_issue_id: link.gcd_issue_id,
      product_name: String(p.row["product-name"]).trim(),
      console_name: String(p.row["console-name"]).trim(),
      release_date: releaseDate,
      prices,
      sales_volume: Number.isFinite(salesVolume) && salesVolume > 0 ? Math.round(salesVolume) : null,
      match_method: link.method,
    };
    out.row_hash = rowHash(out);
    rows.push(out);
  }
  console.log(`Rows with at least one price: ${rows.length}`);

  const existing = await readAllKeyset("existing hashes", () => supabase.from("pricecharting_prices").select("pc_id, row_hash"), "pc_id");
  const existingHash = new Map(existing.map((r) => [Number(r.pc_id), r.row_hash]));
  const changed = rows.filter((r) => existingHash.get(r.pc_id) !== r.row_hash);
  const keep = new Set(rows.map((r) => r.pc_id));
  const stale = existing.map((r) => Number(r.pc_id)).filter((id) => !keep.has(id));
  console.log(`Stored ${existing.length}; ${changed.length} new or changed; ${stale.length} no longer linked`);

  if (!APPLY) {
    console.log("Dry run. Pass --apply to write.");
    return;
  }

  const now = new Date().toISOString();
  let written = 0;
  for (const batch of chunked(changed, WRITE_BATCH)) {
    await withRetry("upsert pricecharting_prices", () =>
      supabase.from("pricecharting_prices").upsert(batch.map((r) => ({ ...r, updated_at: now })), { onConflict: "pc_id" })
    );
    written += batch.length;
  }
  console.log(`Wrote ${written} rows`);

  if (stale.length && rows.length >= existing.length * PRUNE_MIN_RATIO) {
    for (const ids of chunked(stale, 300)) {
      await withRetry("prune pricecharting_prices", () => supabase.from("pricecharting_prices").delete().in("pc_id", ids));
    }
    console.log(`Removed ${stale.length} rows no longer in the guide or no longer linked`);
  } else if (stale.length) {
    console.log(`Skipped pruning ${stale.length} rows: today's ${rows.length} rows are under ${PRUNE_MIN_RATIO * 100}% of the ${existing.length} stored`);
  }
  console.log(`Done in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

main().catch((error) => {
  console.error(`fetchPriceCharting failed: ${describeError(error)}`);
  process.exit(1);
});
