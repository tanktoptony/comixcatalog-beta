// Repairs series.resolved_publisher_cached using year-aware logic.
//
// Background: a previous audit canonicalized stale cached strings ("Mirage",
// "Mirage Publishing Inc.") without checking series.cv_publisher. This let
// noisy GCD indicia win over ComicVine's clean series-level attribution —
// e.g. IDW's 2011 TMNT main run got cached as "Mirage Studios" because IDW
// reprints carry "Mirage" in the indicia. ComicVine had the correct
// "IDW Publishing" all along.
//
// Strategy:
//   - year_start_cached >= 2000 (or null): trust cv_publisher. Modern era,
//     ComicVine is reliable.
//   - year_start_cached < 2000: prefer GCD indicia candidates over
//     cv_publisher. cv often reflects later IP ownership (IDW owning the
//     TMNT IP today doesn't change that Mirage published it in 1984).
//   - Never downgrade a specific name to "Unknown Publisher".
//
// Usage:
//   node scripts/repairSeriesPublishersWithCv.js          # dry-run
//   node scripts/repairSeriesPublishersWithCv.js --apply  # writes updates

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { resolvePublisher, US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";

const CANONICAL_SET = new Set(US_PUBLISHER_ALLOWLIST);

// Allowlist→allowlist flips are only allowed when the OLD value is one of
// these historical/imprint publishers whose properties commonly transferred
// to a modern owner. Everything else allowlist→allowlist is presumed correct
// already and is held. This stops bad cv data (e.g. G.I. Joe cv_publisher =
// "Image" — stale, IDW has held the license since 2008) from overwriting a
// correct cached attribution. The TMNT Mirage→IDW flip survives because
// Mirage is in this list.
const HISTORICAL_TRANSITION_FROM = new Set([
  "Mirage Studios",
  "WildStorm",
  "Vertigo",
]);

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 1000;
const MODERN_ERA_CUTOFF = 2000;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function paginate(builderFn) {
  const out = [];
  let from = 0;
  while (true) {
    const { data, error } = await builderFn().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

async function run() {
  console.log(APPLY ? "MODE: --apply (writes will happen)" : "MODE: dry-run");
  console.log("Loading all series with gcd_id…");

  const allSeries = await paginate(() =>
    supabase
      .from("series")
      .select(
        "id, gcd_id, title, year_start_cached, cv_publisher, resolved_publisher_cached, publisher:publisher_id(name)"
      )
      .not("gcd_id", "is", null)
  );
  console.log(`  ${allSeries.length} series loaded`);

  // Pull issue-level indicia for all of them.
  const gcdIds = allSeries.map((s) => s.gcd_id);
  const indiciaPubIdsBySeriesGcd = new Map();

  for (let i = 0; i < gcdIds.length; i += 500) {
    const batch = gcdIds.slice(i, i + 500);
    const { data } = await supabase
      .from("gcd_issues")
      .select("series_gcd_id, publisher_gcd_id")
      .in("series_gcd_id", batch);
    for (const row of data ?? []) {
      const k = row.series_gcd_id;
      if (!indiciaPubIdsBySeriesGcd.has(k)) indiciaPubIdsBySeriesGcd.set(k, new Set());
      if (row.publisher_gcd_id != null) {
        indiciaPubIdsBySeriesGcd.get(k).add(row.publisher_gcd_id);
      }
    }
    process.stdout.write(`  indicia fetched: ${Math.min(i + 500, gcdIds.length)}/${gcdIds.length}\r`);
  }
  console.log("");

  // Resolve publisher_gcd_id → name in one go.
  const allPubIds = new Set();
  for (const set of indiciaPubIdsBySeriesGcd.values()) {
    for (const id of set) allPubIds.add(id);
  }
  const pubNameById = new Map();
  if (allPubIds.size > 0) {
    const allIdArr = [...allPubIds];
    for (let i = 0; i < allIdArr.length; i += 500) {
      const batch = allIdArr.slice(i, i + 500);
      const { data } = await supabase
        .from("gcd_publishers")
        .select("gcd_id, name")
        .in("gcd_id", batch);
      for (const row of data ?? []) {
        pubNameById.set(row.gcd_id, row.name);
      }
    }
  }

  const plan = [];
  const skipped = { downgrade: 0, noChange: 0 };
  const buckets = new Map();

  for (const series of allSeries) {
    const oldValue = series.resolved_publisher_cached;
    const year = series.year_start_cached;
    const indiciaPubIds = indiciaPubIdsBySeriesGcd.get(series.gcd_id) ?? new Set();
    const indiciaNames = [...indiciaPubIds]
      .map((id) => pubNameById.get(id))
      .filter(Boolean);
    const publishersFkName = series.publisher?.name ?? null;

    let newValue;

    if (year == null || year >= MODERN_ERA_CUTOFF) {
      // Modern era — trust cv_publisher heavily.
      newValue = resolvePublisher({
        cv: series.cv_publisher,
        candidates: [publishersFkName, ...indiciaNames],
        seriesTitle: series.title,
      });
    } else {
      // Pre-2000 — prefer indicia. cv often reflects later IP ownership
      // (IDW owning the TMNT IP today doesn't change that Mirage published
      // it in 1984). If indicia gives nothing useful, KEEP the old value —
      // do NOT fall back to cv, which is the signal we explicitly distrust
      // for pre-2000 series. Better to leave a row alone than overwrite an
      // indie attribution with the modern IP holder.
      const indiciaResolved = resolvePublisher({
        cv: null,
        candidates: [publishersFkName, ...indiciaNames],
        seriesTitle: series.title,
      });
      if (indiciaResolved && indiciaResolved !== "Unknown Publisher") {
        newValue = indiciaResolved;
      } else {
        newValue = oldValue; // explicit no-op
      }
    }

    if (newValue === oldValue) {
      skipped.noChange += 1;
      continue;
    }

    // Downgrade guard 1: never overwrite a specific name with "Unknown".
    if (
      newValue === "Unknown Publisher" &&
      oldValue &&
      oldValue !== "Unknown Publisher"
    ) {
      skipped.downgrade += 1;
      continue;
    }

    // Downgrade guard 1.5: allowlist→allowlist flips are restricted. Only
    // allow them when the OLD value is a known historical-transition
    // publisher. Stops bad cv data from clobbering a correct cached value
    // (e.g. G.I. Joe cv_publisher="Image" overwriting cached "IDW Publishing").
    if (
      oldValue &&
      CANONICAL_SET.has(oldValue) &&
      CANONICAL_SET.has(newValue) &&
      newValue !== oldValue &&
      !HISTORICAL_TRANSITION_FROM.has(oldValue)
    ) {
      skipped.downgrade += 1;
      continue;
    }

    // Downgrade guard 2: never overwrite a canonical allowlist publisher
    // ("Marvel Comics", "DC Comics", etc.) with a non-canonical foreign
    // reprint shell (e.g. "Panini France S.A.", "Yaffa Publishing Group").
    // The canonical attribution is already the right answer for US-focused
    // search; foreign editions are a separate concern.
    if (
      oldValue &&
      CANONICAL_SET.has(oldValue) &&
      !CANONICAL_SET.has(newValue)
    ) {
      skipped.downgrade += 1;
      continue;
    }

    plan.push({ id: series.id, title: series.title, year, from: oldValue, to: newValue });
    const key = `${oldValue} → ${newValue}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  console.log(`\n${plan.length} rows would change.`);
  console.log(`Skipped (already correct): ${skipped.noChange}`);
  console.log(`Skipped (downgrade guard): ${skipped.downgrade}`);
  console.log("\nTop transitions:");
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sorted.slice(0, 30)) {
    console.log(`  ${String(count).padStart(5)}  ${key}`);
  }
  if (sorted.length > 30) {
    console.log(`  …and ${sorted.length - 30} more transitions`);
  }

  // Spot-check sample for TMNT.
  const tmntSample = plan.filter((p) => p.title.toLowerCase().includes("teenage mutant ninja turtles"));
  if (tmntSample.length > 0) {
    console.log(`\nTMNT spot-check (${tmntSample.length} rows):`);
    for (const p of tmntSample.slice(0, 12)) {
      console.log(`  ${p.year ?? "????"}  ${p.from}  →  ${p.to}   (${p.title})`);
    }
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write.");
    return;
  }

  console.log("\nApplying updates…");
  let applied = 0;
  for (let i = 0; i < plan.length; i += 200) {
    const batch = plan.slice(i, i + 200);
    await Promise.all(
      batch.map((p) =>
        supabase
          .from("series")
          .update({
            resolved_publisher_cached: p.to,
            search_refreshed_at: new Date().toISOString(),
          })
          .eq("id", p.id)
      )
    );
    applied += batch.length;
    process.stdout.write(`  applied ${applied}/${plan.length}\r`);
  }
  console.log("");
  console.log(`Updated ${applied} rows.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
