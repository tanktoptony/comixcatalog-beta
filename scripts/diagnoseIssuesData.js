// Profiles the `gcd_issues` table along multiple axes — strictly read-only.
//
// Answers questions like:
//   - How often is publication_date null? (drives the "Unknown Year" cards.)
//   - What patterns appear in issue_number? (numeric, "1A", "1.NOW",
//     "1 Director's Cut" — these are variants in disguise.)
//   - For the most-variant-heavy series, what does the variant tail look like?
//   - How does data quality vary across eras (pre-1960 vs modern)?
//
// Output is meant to inform the variant-support architecture: schema
// columns, normalization rules, and how to detect existing variants
// without re-ingestion.
//
// Usage: node scripts/diagnoseIssuesData.js
// Optional: --series=<gcd_id>  → deep-dive a single series

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

// Supabase's PostgREST caps responses at 1000 rows by default. Using a
// larger PAGE_SIZE silently truncates AND causes the "data.length < PAGE_SIZE
// → end of table" check to lie, so the script exits after one page.
const PAGE_SIZE = 1000;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const singleSeriesArg = process.argv.find((a) => a.startsWith("--series="));
const SINGLE_SERIES_GCD_ID = singleSeriesArg
  ? Number(singleSeriesArg.split("=")[1])
  : null;

// Categorize an issue_number string into a structural bucket. Used to find
// variant patterns (which usually live in suffixes after the base number).
function classifyIssueNumber(raw) {
  if (raw == null) return "null";
  const s = String(raw).trim();
  if (!s) return "empty";

  // Pure numeric: "1", "127", "0"
  if (/^\d+$/.test(s)) return "numeric";
  // Decimal numeric: "0.5", "1.1", "12.5"
  if (/^\d+\.\d+$/.test(s)) return "decimal";
  // Number + letter suffix: "1A", "27B", "1AU"
  if (/^\d+[a-zA-Z]+$/.test(s)) return "num+alpha";
  // Number + .word: "1.NOW", "1.MU"
  if (/^\d+\.[A-Za-z]+$/.test(s)) return "num+.word";
  // Number + space + word: "1 Director's Cut", "5 Variant"
  if (/^\d+\s+\S/.test(s)) return "num+space+word";
  // Number + slash + something (years often): "5/1991"
  if (/^\d+\/\S/.test(s)) return "num+slash";
  // Bracketed: "1 [Second Printing]"
  if (/\[/.test(s)) return "has-brackets";
  // Hashed: "#1"
  if (/^#/.test(s)) return "hashed";
  // Pure non-numeric: "Annual", "Special"
  if (/^[a-zA-Z]/.test(s)) return "alpha-only";
  return "other";
}

function baseNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function bucketYear(year) {
  if (year == null) return "no-year";
  if (year < 1960) return "pre-1960";
  if (year < 1980) return "1960-1979";
  if (year < 2000) return "1980-1999";
  if (year < 2020) return "2000-2019";
  return "2020+";
}

function parseYear(value) {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isInteger(n) && n > 1800 && n < 2100) return n;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

async function* keysetIterate(builderFn, keyColumn = "gcd_id") {
  let lastKey = null;
  while (true) {
    let q = builderFn().order(keyColumn, { ascending: true }).limit(PAGE_SIZE);
    if (lastKey != null) q = q.gt(keyColumn, lastKey);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) yield row;
    lastKey = data[data.length - 1][keyColumn];
    if (data.length < PAGE_SIZE) break;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Mode A: single-series deep dive.
// ───────────────────────────────────────────────────────────────────────────
async function singleSeriesDive(seriesGcdId) {
  console.log(`Single-series dive: series_gcd_id = ${seriesGcdId}\n`);

  const { data: seriesRow } = await supabase
    .from("gcd_series")
    .select("gcd_id, name, year_began, year_ended, publisher_gcd_id")
    .eq("gcd_id", seriesGcdId)
    .single();

  if (!seriesRow) {
    console.log("No matching gcd_series row.");
    return;
  }
  console.log(`Title:      ${seriesRow.name}`);
  console.log(`Years:      ${seriesRow.year_began ?? "?"}–${seriesRow.year_ended ?? "?"}`);

  const { data: issues } = await supabase
    .from("gcd_issues")
    .select("gcd_id, issue_number, publication_date, title")
    .eq("series_gcd_id", seriesGcdId)
    .order("gcd_id", { ascending: true })
    .limit(1000);

  console.log(`Issues:     ${issues?.length ?? 0}\n`);

  // Group by normalized base number to expose variant tails.
  const byBase = new Map();
  for (const row of issues ?? []) {
    const base = baseNumber(row.issue_number) ?? "_nonnumeric";
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(row);
  }

  console.log(`Distinct base numbers: ${byBase.size}`);
  console.log(`Avg rows per base:     ${((issues?.length ?? 0) / byBase.size).toFixed(2)}`);

  // Top-variant base numbers.
  const sortedBases = [...byBase.entries()].sort((a, b) => b[1].length - a[1].length);
  console.log("\nTop bases by row count (likely variant clusters):");
  for (const [base, rows] of sortedBases.slice(0, 10)) {
    console.log(`  #${base}: ${rows.length} rows`);
    for (const r of rows.slice(0, 6)) {
      const year = parseYear(r.publication_date);
      console.log(`    issue_number=${JSON.stringify(r.issue_number)}  year=${year ?? "?"}  title=${(r.title || "").slice(0, 50)}`);
    }
    if (rows.length > 6) console.log(`    …and ${rows.length - 6} more`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Mode B: full-table profile.
// ───────────────────────────────────────────────────────────────────────────
async function fullProfile() {
  console.log("Full-table profile of gcd_issues. This streams the table.\n");

  let total = 0;
  let nullPubDate = 0;
  let nullIssueNumber = 0;
  let nullSeriesGcdId = 0;
  let nullPublisherGcdId = 0;
  const formatCounts = new Map();
  const yearBucketCounts = new Map();
  const yearBucketNullDate = new Map();

  // For variant analysis: track per-series row count and per-(series,base) row count.
  // Cap to ~200k series to keep memory bounded (we have ~220k gcd_series).
  const rowsPerSeries = new Map();           // series_gcd_id → total rows
  const distinctBasePerSeries = new Map();   // series_gcd_id → Set of base numbers
  const variantSuffixCounts = new Map();     // suffix → count, across all rows

  for await (const row of keysetIterate(
    () =>
      supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, publisher_gcd_id, issue_number, publication_date"),
    "gcd_id"
  )) {
    total += 1;
    if (row.publication_date == null) nullPubDate += 1;
    if (row.issue_number == null) nullIssueNumber += 1;
    if (row.series_gcd_id == null) nullSeriesGcdId += 1;
    if (row.publisher_gcd_id == null) nullPublisherGcdId += 1;

    const fmt = classifyIssueNumber(row.issue_number);
    formatCounts.set(fmt, (formatCounts.get(fmt) ?? 0) + 1);

    const year = parseYear(row.publication_date);
    const bucket = bucketYear(year);
    yearBucketCounts.set(bucket, (yearBucketCounts.get(bucket) ?? 0) + 1);
    if (row.publication_date == null) {
      yearBucketNullDate.set(bucket, (yearBucketNullDate.get(bucket) ?? 0) + 1);
    }

    if (row.series_gcd_id != null) {
      rowsPerSeries.set(row.series_gcd_id, (rowsPerSeries.get(row.series_gcd_id) ?? 0) + 1);
      const base = baseNumber(row.issue_number);
      if (base != null) {
        if (!distinctBasePerSeries.has(row.series_gcd_id)) {
          distinctBasePerSeries.set(row.series_gcd_id, new Set());
        }
        distinctBasePerSeries.get(row.series_gcd_id).add(base);
      }
      // Variant suffix: extract whatever follows the base number.
      const raw = String(row.issue_number ?? "").trim();
      const m = raw.match(/^\d+(?:\.\d+)?(.*)$/);
      if (m && m[1]) {
        const suffix = m[1].trim().slice(0, 30);
        if (suffix) variantSuffixCounts.set(suffix, (variantSuffixCounts.get(suffix) ?? 0) + 1);
      }
    }

    if (total % 100000 === 0) {
      process.stdout.write(`  scanned ${total.toLocaleString()}\r`);
    }
  }
  process.stdout.write("\n");

  // ── Reports ────────────────────────────────────────────────────────────
  console.log("\n══════ TABLE NULL-RATE ══════");
  console.log(`  total rows               : ${total.toLocaleString()}`);
  console.log(`  null publication_date    : ${nullPubDate.toLocaleString()} (${(nullPubDate / total * 100).toFixed(1)}%)`);
  console.log(`  null issue_number        : ${nullIssueNumber.toLocaleString()} (${(nullIssueNumber / total * 100).toFixed(1)}%)`);
  console.log(`  null series_gcd_id       : ${nullSeriesGcdId.toLocaleString()} (${(nullSeriesGcdId / total * 100).toFixed(1)}%)`);
  console.log(`  null publisher_gcd_id    : ${nullPublisherGcdId.toLocaleString()} (${(nullPublisherGcdId / total * 100).toFixed(1)}%)`);

  console.log("\n══════ ISSUE_NUMBER FORMATS ══════");
  const sortedFormats = [...formatCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [fmt, count] of sortedFormats) {
    const pct = (count / total * 100).toFixed(1);
    console.log(`  ${fmt.padEnd(18)} ${String(count).padStart(10)}  (${pct}%)`);
  }

  console.log("\n══════ YEAR BUCKETS ══════");
  const eras = ["no-year", "pre-1960", "1960-1979", "1980-1999", "2000-2019", "2020+"];
  for (const era of eras) {
    const count = yearBucketCounts.get(era) ?? 0;
    const nullDate = yearBucketNullDate.get(era) ?? 0;
    console.log(`  ${era.padEnd(12)} ${String(count).padStart(10)}   null-date: ${String(nullDate).padStart(8)}`);
  }

  console.log("\n══════ VARIANT SUFFIXES (top 30) ══════");
  const sortedSuffixes = [...variantSuffixCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [suffix, count] of sortedSuffixes.slice(0, 30)) {
    console.log(`  ${JSON.stringify(suffix).padEnd(28)} ${String(count).padStart(8)}`);
  }
  console.log(`  ...and ${Math.max(0, sortedSuffixes.length - 30)} more distinct suffixes`);

  // ── Variant-heavy series ──────────────────────────────────────────────
  console.log("\n══════ TOP VARIANT-HEAVY SERIES ══════");
  console.log("  Ratio = rows / distinct base numbers. Higher = more variants per issue.\n");

  const seriesIdsByRatio = [...rowsPerSeries.entries()]
    .filter(([sid]) => distinctBasePerSeries.has(sid) && distinctBasePerSeries.get(sid).size >= 5)
    .map(([sid, rows]) => ({
      sid,
      rows,
      bases: distinctBasePerSeries.get(sid).size,
      ratio: rows / distinctBasePerSeries.get(sid).size,
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 20);

  // Fetch series names for these top hits.
  const topSids = seriesIdsByRatio.map((s) => s.sid);
  const { data: nameRows } = await supabase
    .from("gcd_series")
    .select("gcd_id, name, year_began")
    .in("gcd_id", topSids);
  const nameById = new Map((nameRows ?? []).map((r) => [r.gcd_id, r]));

  for (const s of seriesIdsByRatio) {
    const meta = nameById.get(s.sid);
    const name = meta?.name ?? `(unknown)`;
    const year = meta?.year_began ?? "?";
    console.log(
      `  ${name.slice(0, 50).padEnd(52)} (${year})  ` +
      `${String(s.rows).padStart(5)} rows / ${String(s.bases).padStart(4)} issues  ratio=${s.ratio.toFixed(2)}`
    );
  }

  // ── Variant total estimate ───────────────────────────────────────────
  let totalVariantBearingRows = 0;
  let totalDistinctIssues = 0;
  for (const [sid, rows] of rowsPerSeries) {
    const baseCount = distinctBasePerSeries.get(sid)?.size ?? 0;
    if (baseCount > 0) {
      totalDistinctIssues += baseCount;
      totalVariantBearingRows += rows;
    }
  }
  const variantOverhead = totalVariantBearingRows - totalDistinctIssues;

  console.log("\n══════ VARIANT-VS-ISSUE TOTALS ══════");
  console.log(`  total rows (variants+issues)   : ${totalVariantBearingRows.toLocaleString()}`);
  console.log(`  distinct issues (base numbers) : ${totalDistinctIssues.toLocaleString()}`);
  console.log(`  variant overhead (extra rows)  : ${variantOverhead.toLocaleString()}`);
  console.log(`  avg variants per issue         : ${(totalVariantBearingRows / totalDistinctIssues).toFixed(2)}`);
}

// ───────────────────────────────────────────────────────────────────────────
async function run() {
  if (SINGLE_SERIES_GCD_ID != null) {
    await singleSeriesDive(SINGLE_SERIES_GCD_ID);
  } else {
    await fullProfile();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
