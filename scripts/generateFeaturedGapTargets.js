// Generates a ComicVine `--targets` JSON listing every FEATURED_SERIES entry
// that has a matching `series` row but no featured_cover_path_cached yet.
//
// Use this to fire a *small, surgical* ComicVine ingest against the curated
// hot-books list — way higher hit rate than the generic gap generator
// because every entry is a real, well-known, well-indexed series.
//
// Usage:
//   node scripts/generateFeaturedGapTargets.js
//   node scripts/generateFeaturedGapTargets.js --out=gap-featured.json
//
// Then:
//   python comicvine_api_to_supabase.py --targets gap-featured.json --skip-existing

import dotenv from "dotenv";
import path from "path";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "../src/lib/featuredSeries.js";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const OUT = path.resolve(__dirname, "..", args.out ?? "gap-featured.json");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log(`Scanning ${FEATURED_SERIES.length} featured entries for missing covers...\n`);

  // Pull all matching candidates in one query.
  const titles = [...new Set(FEATURED_SERIES.map((e) => e.title))];
  const { data: rows } = await supabase
    .from("series")
    .select("title, year_start_cached, resolved_publisher_cached, featured_cover_path_cached")
    .in("title", titles);

  // Group by (title, publisher) for prefer-year selection.
  const pool = new Map();
  for (const r of rows ?? []) {
    const key = `${r.title.toLowerCase()}::${(r.resolved_publisher_cached ?? "").toLowerCase()}`;
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(r);
  }

  const gaps = [];
  for (const entry of FEATURED_SERIES) {
    const key = `${entry.title.toLowerCase()}::${entry.publisher.toLowerCase()}`;
    const candidates = pool.get(key) ?? [];

    // Pick the best (closest prefer_year) row for this entry.
    let best = null;
    if (candidates.length === 1) {
      best = candidates[0];
    } else if (candidates.length > 1 && entry.prefer_year != null) {
      let bestDelta = Infinity;
      for (const r of candidates) {
        if (r.year_start_cached == null) continue;
        const delta = Math.abs(r.year_start_cached - entry.prefer_year);
        if (delta < bestDelta) {
          best = r;
          bestDelta = delta;
        }
      }
    } else if (candidates.length > 1) {
      best = candidates[0];
    }

    if (best && !best.featured_cover_path_cached) {
      gaps.push({
        name: entry.title,
        publisher: entry.publisher,
        year: best.year_start_cached ?? entry.prefer_year ?? null,
      });
    }
  }

  console.log(`Found ${gaps.length} entries with matching row + no cover:\n`);
  for (const g of gaps) {
    console.log(`  ${(g.publisher ?? "?").padEnd(20)} (${g.year ?? "?"})  ${g.name}`);
  }

  writeFileSync(OUT, JSON.stringify(gaps, null, 2));
  console.log(`\nWrote ${gaps.length} targets → ${OUT}`);
  console.log(`\nNext step:`);
  console.log(`  python comicvine_api_to_supabase.py --targets ${path.basename(OUT)} --skip-existing`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
