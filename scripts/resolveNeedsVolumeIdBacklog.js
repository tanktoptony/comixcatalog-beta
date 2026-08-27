// Resolves the "free" entries in needs_volume_id.json: series where
// comicvine_api_to_supabase.py found a title/publisher mismatch on
// ComicVine (GCD says one publisher, ComicVine files it under another —
// UK reprints, foreign imprints, distributor-vs-publisher drift) but
// ComicVine's search returned EXACTLY ONE same-titled candidate. With
// only one candidate there's nothing to disambiguate — it's not a real
// ambiguity, just a name the matcher was told to be conservative about.
//
// For each single-candidate entry this script:
//   1. Finds the matching `series` row by (title, resolved_publisher_cached),
//      requiring a UNIQUE match — duplicate-titled GCD series are common
//      (see the 2026-08 foreign-duplicate-series purge and the repeated
//      GCD mislinking incidents), so an ambiguous series-side match is
//      skipped rather than guessed at.
//   2. Pins series.comicvine_volume_id to the candidate's ComicVine id.
//      comicvine_api_to_supabase.py checks this pin BEFORE its fragile
//      title-based gcd_id resolution, so once set, ingest can never
//      mis-route this volume's covers to a same-titled sibling series
//      again (migration 0022).
//   3. Appends {name, publisher, year, volume_id} to gap-pinned.json so
//      the next cover-ingest run fetches the volume directly via its id,
//      skipping the fuzzy search that failed in the first place.
//   4. Removes the resolved entry from needs_volume_id.json so the
//      backlog only tracks genuinely unresolved cases going forward.
//
// Entries with 0 or 2+ candidates are left untouched — those need either
// a human call or a future matcher improvement, not this script.
//
// Usage: node scripts/resolveNeedsVolumeIdBacklog.js [--dry-run]

import dotenv from "dotenv";
import path from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = path.resolve(__dirname, "..");
const NEEDS_VOLUME_ID_PATH = path.join(ROOT, "needs_volume_id.json");
const GAP_PINNED_PATH = path.join(ROOT, "gap-pinned.json");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function loadJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, "utf8"));
}

async function run() {
  const backlog = loadJson(NEEDS_VOLUME_ID_PATH, []);
  const singleCandidate = backlog.filter((e) => (e.candidates || []).length === 1);

  console.log(`Backlog entries: ${backlog.length}`);
  console.log(`Single-candidate (auto-resolvable): ${singleCandidate.length}`);

  const pinnedTargets = loadJson(GAP_PINNED_PATH, []);
  const alreadyPinnedKeys = new Set(
    pinnedTargets.map((t) => `${t.name} ${t.publisher} ${t.year}`)
  );

  const resolvedKeys = new Set();
  let pinned = 0;
  let skippedAmbiguousSeries = 0;
  let skippedNoSeriesMatch = 0;
  let skippedAlreadyPinned = 0;

  for (const entry of singleCandidate) {
    const key = `${entry.name} ${entry.publisher} ${entry.year}`;
    const candidate = entry.candidates[0];

    if (alreadyPinnedKeys.has(key)) {
      skippedAlreadyPinned++;
      resolvedKeys.add(key);
      continue;
    }

    const { data: matches, error } = await supabase
      .from("series")
      .select("id, title, resolved_publisher_cached, comicvine_volume_id")
      .eq("title", entry.name)
      .eq("resolved_publisher_cached", entry.publisher);

    if (error) {
      console.error(`  ✗ query failed for "${entry.name}":`, error.message);
      continue;
    }

    if (!matches || matches.length === 0) {
      skippedNoSeriesMatch++;
      continue;
    }
    if (matches.length > 1) {
      skippedAmbiguousSeries++;
      console.log(
        `  ~ skipping ${entry.name} (${entry.publisher}): ${matches.length} series rows share this title+publisher — not safe to auto-pin.`
      );
      continue;
    }

    const series = matches[0];
    if (series.comicvine_volume_id && series.comicvine_volume_id !== candidate.id) {
      console.log(
        `  ~ skipping ${entry.name}: already pinned to a different volume id (${series.comicvine_volume_id}) — leaving as-is.`
      );
      continue;
    }

    console.log(
      `  ✓ ${entry.name} (${entry.publisher}) → volume ${candidate.id} (${candidate.publisher || "unknown publisher"}, ${candidate.start_year ?? "?"})`
    );

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("series")
        .update({ comicvine_volume_id: candidate.id })
        .eq("id", series.id);
      if (updateError) {
        console.error(`    ✗ failed to pin: ${updateError.message}`);
        continue;
      }
      pinnedTargets.push({
        name: entry.name,
        publisher: entry.publisher,
        year: entry.year,
        volume_id: candidate.id,
      });
    }

    resolvedKeys.add(key);
    pinned++;
  }

  console.log(`\nPinned: ${pinned}`);
  console.log(`Already pinned (re-queued): ${skippedAlreadyPinned}`);
  console.log(`Skipped — no matching series row: ${skippedNoSeriesMatch}`);
  console.log(`Skipped — ambiguous series match (2+ rows): ${skippedAmbiguousSeries}`);

  if (!DRY_RUN) {
    const remaining = backlog.filter((e) => {
      const key = `${e.name} ${e.publisher} ${e.year}`;
      return !resolvedKeys.has(key);
    });
    writeFileSync(NEEDS_VOLUME_ID_PATH, JSON.stringify(remaining, null, 2));
    writeFileSync(GAP_PINNED_PATH, JSON.stringify(pinnedTargets, null, 2));
    console.log(`\nneeds_volume_id.json: ${backlog.length} → ${remaining.length} entries`);
    console.log(`gap-pinned.json: ${pinnedTargets.length} total targets`);
  } else {
    console.log("\n[dry-run] No writes performed.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
