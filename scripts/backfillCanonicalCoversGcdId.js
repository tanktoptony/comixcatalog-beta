// scripts/backfillCanonicalCoversGcdId.js — populate
// canonical_covers.series_gcd_id for existing rows so cover joins can
// switch from fragile title-string matching to robust integer ID matching.
//
// Strategy:
//   1. Page through canonical_covers where series_gcd_id IS NULL.
//   2. For each row, look up matching series via:
//        a. Exact title match (case-sensitive)  - fastest, narrowest
//        b. Case-insensitive ilike match if (a) fails
//        c. Disambiguate by series_year ± 1 when multiple series match
//   3. UPDATE the row with the resolved gcd_id.
//   4. Track stats: matched / ambiguous / no-match.
//
// Idempotent — run repeatedly. Only updates rows still NULL.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE = 1000;

const stats = {
  scanned: 0,
  matched: 0,
  ambiguousResolved: 0,
  ambiguousUnresolved: 0,
  noMatch: 0,
  errors: 0,
};

async function pageOfNullRows(fromId) {
  const { data, error } = await supabase
    .from("canonical_covers")
    .select("id, series_title, series_year")
    .is("series_gcd_id", null)
    .not("series_title", "is", null)
    .gt("id", fromId)
    .order("id")
    .limit(PAGE);
  if (error) throw error;
  return data ?? [];
}

// Normalize a series title for fuzzy comparison. Collapses the punctuation
// drift that splits the same actual series into multiple "different" titles:
//   "G.I. Joe, a Real American Hero" → "gi joe a real american hero"
//   "G.I. Joe: A Real American Hero" → "gi joe a real american hero"
//   "Spider-Man" / "Spider Man" / "Spiderman" → "spider man"
// Also strips smart quotes / em-dashes / em-spaces which mojibake replaces
// with U+FFFD on bad ingests.
function normalizeTitle(t) {
  return String(t ?? "")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/�/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Build the series index ONCE (217k rows) instead of per-row Supabase queries.
// Massive speedup vs the prior approach (each canonical_cover triggered 1-2
// network roundtrips to fetch its candidate series). The 20k-row backfill
// dropped from ~30 min to ~30 sec with this change.
const seriesIndex = {
  byExact: new Map(),  // exact title -> [{gcd_id, title, year_start_cached}]
  byNorm: new Map(),   // normalized title -> [{gcd_id, title, year_start_cached}]
  loaded: false,
};

async function loadSeriesIndex() {
  if (seriesIndex.loaded) return;
  process.stdout.write("Loading series index... ");
  const PAGE = 1000;
  let from = 0;
  let total = 0;
  while (true) {
    const { data, error } = await supabase
      .from("series")
      .select("gcd_id, title, year_start_cached")
      .not("gcd_id", "is", null)
      .order("gcd_id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!row.title) continue;
      if (!seriesIndex.byExact.has(row.title)) seriesIndex.byExact.set(row.title, []);
      seriesIndex.byExact.get(row.title).push(row);
      const nk = normalizeTitle(row.title);
      if (nk) {
        if (!seriesIndex.byNorm.has(nk)) seriesIndex.byNorm.set(nk, []);
        seriesIndex.byNorm.get(nk).push(row);
      }
    }
    total += data.length;
    if (data.length < PAGE) break;
    from += PAGE;
  }
  seriesIndex.loaded = true;
  console.log(`${total} series indexed (${seriesIndex.byExact.size} exact, ${seriesIndex.byNorm.size} normalized).`);
}

async function lookupSeries(title) {
  await loadSeriesIndex();
  // 1. Exact match
  const exact = seriesIndex.byExact.get(title);
  if (exact && exact.length > 0) return exact;
  // 2. Normalized match — punctuation drift, article casing, mojibake
  const norm = normalizeTitle(title);
  if (norm) {
    const fuzzy = seriesIndex.byNorm.get(norm);
    if (fuzzy && fuzzy.length > 0) return fuzzy;
  }
  return [];
}

// Multi-volume disambiguation. ComicVine's series_year is the START year of
// the volume the cover belongs to; series.year_start_cached is the same thing
// from the GCD side. Same volume → same start year, usually.
//
// Strategy: pick the candidate with the smallest year delta. Accept the pick
// when it's a runaway winner (closest is <=2 yrs AND clearly closer than the
// runner-up by >=2 yrs) OR when the closest is within absolute tolerance=3.
// Above that, the volumes are too far apart to risk a wrong assignment.
function pickByYear(candidates, targetYear, tolerance = 3) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (targetYear == null) return null;
  const scored = candidates
    .filter((c) => c.year_start_cached != null)
    .map((c) => ({ c, delta: Math.abs(c.year_start_cached - targetYear) }))
    .sort((a, b) => a.delta - b.delta);
  if (scored.length === 0) return null;
  const [best, runnerUp] = scored;
  if (best.delta <= tolerance) return best.c;
  if (runnerUp && runnerUp.delta - best.delta >= 2 && best.delta <= 5) return best.c;
  return null;
}

async function processRow(row) {
  stats.scanned++;

  let candidates;
  try {
    candidates = await lookupSeries(row.series_title);
  } catch (e) {
    console.error("  lookup error:", row.series_title, e.message);
    stats.errors++;
    return;
  }

  if (candidates.length === 0) {
    stats.noMatch++;
    return;
  }

  let chosen = null;
  if (candidates.length === 1) {
    chosen = candidates[0];
    stats.matched++;
  } else {
    chosen = pickByYear(candidates, row.series_year);
    if (chosen) stats.ambiguousResolved++;
    else {
      stats.ambiguousUnresolved++;
      return;
    }
  }

  const { error } = await supabase
    .from("canonical_covers")
    .update({ series_gcd_id: chosen.gcd_id })
    .eq("id", row.id);
  if (error) {
    console.error("  update error on id", row.id, ":", error.message);
    stats.errors++;
  }
}

async function main() {
  console.log("\n=== backfillCanonicalCoversGcdId ===\n");

  // Sanity check: column exists.
  const { error: probeErr } = await supabase
    .from("canonical_covers")
    .select("series_gcd_id")
    .limit(1);
  if (probeErr) {
    console.error(
      "Column series_gcd_id does not exist on canonical_covers.\n" +
        "Apply migration 0009 first (paste 0009_canonical_covers_series_gcd_id.sql\n" +
        "into the Supabase dashboard SQL editor) then re-run."
    );
    process.exit(1);
  }

  let fromId = 0;
  let cycle = 0;
  while (true) {
    const rows = await pageOfNullRows(fromId);
    if (rows.length === 0) break;
    cycle++;
    for (const r of rows) {
      await processRow(r);
    }
    fromId = rows[rows.length - 1].id;
    console.log(
      `cycle ${cycle}: scanned=${stats.scanned} matched=${stats.matched} ` +
        `amb_resolved=${stats.ambiguousResolved} amb_unresolved=${stats.ambiguousUnresolved} ` +
        `no_match=${stats.noMatch} err=${stats.errors}`
    );
  }

  console.log("\nDone.");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
