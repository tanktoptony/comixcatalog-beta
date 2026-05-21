// Reports which FEATURED_SERIES entries actually map to a real `series` row.
// Helps us see which curated picks GCD has (and which it doesn't yet, e.g.
// brand-new 2024-2025 launches that ingest hasn't reached).
//
// Usage: node scripts/validateFeaturedSeries.js

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "../src/lib/featuredSeries.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findBestMatch({ title, publisher, prefer_year }) {
  // First try exact title + publisher + year_start_cached.
  const { data: exact } = await supabase
    .from("series")
    .select("id, title, year_start_cached, year_end_cached, issue_count_cached, featured_cover_path_cached, resolved_publisher_cached")
    .eq("title", title)
    .eq("resolved_publisher_cached", publisher)
    .eq("year_start_cached", prefer_year);

  if (exact && exact.length === 1) return { match: exact[0], how: "exact-year" };

  // Fall back to title + publisher with closest year_start_cached to prefer_year.
  const { data: candidates } = await supabase
    .from("series")
    .select("id, title, year_start_cached, year_end_cached, issue_count_cached, featured_cover_path_cached, resolved_publisher_cached")
    .eq("title", title)
    .eq("resolved_publisher_cached", publisher);

  if (!candidates || candidates.length === 0) return { match: null, how: "no-match" };
  if (candidates.length === 1) return { match: candidates[0], how: "single-fallback" };

  // Multiple candidates — pick closest year.
  let best = null;
  let bestDelta = Infinity;
  for (const c of candidates) {
    if (c.year_start_cached == null) continue;
    const delta = Math.abs(c.year_start_cached - prefer_year);
    if (delta < bestDelta) {
      best = c;
      bestDelta = delta;
    }
  }
  return best
    ? { match: best, how: `closest-year (Δ${bestDelta})` }
    : { match: candidates[0], how: "fallback-first" };
}

async function run() {
  console.log(`Validating ${FEATURED_SERIES.length} featured entries against series table...\n`);
  let matched = 0;
  let missing = 0;
  let withCover = 0;

  for (const entry of FEATURED_SERIES) {
    const result = await findBestMatch(entry);
    if (!result.match) {
      console.log(`  ✗ ${entry.title.padEnd(36)} ${entry.publisher.padEnd(18)} prefer=${entry.prefer_year}  → NO MATCH`);
      missing += 1;
      continue;
    }
    const m = result.match;
    const coverFlag = m.featured_cover_path_cached ? "✓cover" : "✗cover";
    console.log(
      `  ✓ ${entry.title.padEnd(36)} ${entry.publisher.padEnd(18)} prefer=${entry.prefer_year} → ` +
        `yr=${m.year_start_cached ?? "?"}-${m.year_end_cached ?? "?"} ` +
        `issues=${m.issue_count_cached ?? 0} ${coverFlag} (${result.how})`
    );
    matched += 1;
    if (m.featured_cover_path_cached) withCover += 1;
  }

  console.log(`\n══════ SUMMARY ══════`);
  console.log(`  Total entries:   ${FEATURED_SERIES.length}`);
  console.log(`  Matched in DB:   ${matched}`);
  console.log(`  Missing:         ${missing}`);
  console.log(`  With cover:      ${withCover}  ← these will appear in the carousel`);
  console.log(`  Matched no cover: ${matched - withCover}  ← need ComicVine ingest`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
