// Audits existing series.featured_cover_path_cached assignments and NULLs
// out the ones that don't actually align with the volume's year range.
//
// Why: refreshSeriesSearchCache.js used to pick a "best available" cover even
// when no candidate fell within the series's year window — so a 1940 Batman
// row might end up with a 2016 Batman cover, leading users to click the tile
// expecting 2016 content and landing on 1940 issues. The script has been
// tightened to require year alignment, but existing rows still have the
// wrong assignments.
//
// This fixup script walks every series with a non-null featured cover, joins
// canonical_covers by storage_path, and drops the assignment if the canonical
// row's series_year (or cover_date year) falls outside year_start_cached..
// year_end_cached + a small tolerance. Faster than a full refresh — only
// touches the ~3.8k rows that have a cover assigned.
//
// Usage:
//   node scripts/fixupFeaturedCovers.js          # dry-run, report only
//   node scripts/fixupFeaturedCovers.js --apply  # actually NULL bad rows

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APPLY = process.argv.includes("--apply");
const TOLERANCE_YEARS = 1;
const PAGE_SIZE = 500;

function parseYear(value) {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1800 && n <= 2100) return Math.trunc(n);
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

async function fetchAllSeries() {
  const out = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("series")
      .select("id, title, year_start_cached, year_end_cached, featured_cover_path_cached")
      .not("featured_cover_path_cached", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

async function fetchCoverMetaByPaths(paths) {
  // Postgres has limits on how many we can pass via .in(); chunk it.
  const CHUNK = 200;
  const meta = new Map();
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("canonical_covers")
      .select("storage_path, series_year, cover_date")
      .in("storage_path", slice);
    if (error) throw error;
    for (const row of data ?? []) {
      // Multiple rows may share a storage_path (rare). Keep the first; the
      // year_alignment check is permissive about which one anyway.
      if (!meta.has(row.storage_path)) meta.set(row.storage_path, row);
    }
  }
  return meta;
}

function isAligned(series, coverMeta) {
  if (!coverMeta) return false;
  const yStart = parseYear(series.year_start_cached);
  const yEnd = parseYear(series.year_end_cached);
  const coverYear =
    parseYear(coverMeta.series_year) ?? parseYear(coverMeta.cover_date);

  // If we have no series year span, we can't validate — leave it alone.
  if (yStart == null) return true;
  // If the cover has no year info, leave it alone (we can't disprove).
  if (coverYear == null) return true;

  const lo = yStart - TOLERANCE_YEARS;
  const hi = (yEnd ?? yStart) + TOLERANCE_YEARS;
  return coverYear >= lo && coverYear <= hi;
}

async function run() {
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log(APPLY ? "Mode: APPLY (will write NULLs)" : "Mode: dry-run");

  const series = await fetchAllSeries();
  console.log(`Series with featured cover: ${series.length}`);

  const paths = [...new Set(series.map((s) => s.featured_cover_path_cached))];
  const coverMeta = await fetchCoverMetaByPaths(paths);
  console.log(`Distinct storage paths: ${paths.length}`);
  console.log(`Resolved canonical_covers rows: ${coverMeta.size}`);

  const toNull = [];
  let aligned = 0;
  let missingMeta = 0;
  let yearMissing = 0;

  for (const s of series) {
    const meta = coverMeta.get(s.featured_cover_path_cached);
    if (!meta) {
      missingMeta += 1;
      toNull.push(s);
      continue;
    }
    if (!isAligned(s, meta)) {
      toNull.push(s);
    } else {
      const coverYear =
        parseYear(meta.series_year) ?? parseYear(meta.cover_date);
      if (coverYear == null) yearMissing += 1;
      aligned += 1;
    }
  }

  console.log("\n──────── Audit ────────");
  console.log(`Aligned (kept):          ${aligned}`);
  console.log(`  └ kept-but-no-year:    ${yearMissing} (couldn't verify, left alone)`);
  console.log(`Bad alignment (NULL):    ${toNull.length - missingMeta}`);
  console.log(`Missing canonical row:   ${missingMeta}`);
  console.log(`Total to NULL:           ${toNull.length}`);
  console.log("───────────────────────");

  if (toNull.length > 0) {
    console.log("\nFirst 10 to NULL:");
    for (const s of toNull.slice(0, 10)) {
      const meta = coverMeta.get(s.featured_cover_path_cached);
      const coverYear = meta
        ? parseYear(meta.series_year) ?? parseYear(meta.cover_date)
        : null;
      console.log(
        `  ${s.title} (${s.year_start_cached ?? "?"}–${s.year_end_cached ?? "?"})  ` +
          `vs cover_year=${coverYear ?? "missing"}  path=${s.featured_cover_path_cached}`
      );
    }
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to NULL the bad rows.");
    return;
  }

  console.log("\nApplying NULLs in batches...");
  const BATCH = 200;
  let written = 0;
  for (let i = 0; i < toNull.length; i += BATCH) {
    const ids = toNull.slice(i, i + BATCH).map((s) => s.id);
    const { error } = await supabase
      .from("series")
      .update({ featured_cover_path_cached: null })
      .in("id", ids);
    if (error) {
      console.error(`Batch ${i} failed:`, error);
      break;
    }
    written += ids.length;
    process.stdout.write(`\r  written ${written}/${toNull.length}`);
  }
  console.log(`\nDone. NULLed ${written} rows.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
