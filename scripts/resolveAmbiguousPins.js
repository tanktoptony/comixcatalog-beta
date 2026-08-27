// One-time remediation for a bug introduced and caught live 2026-08-27:
// repairAllCoverSeriesLinks.js's first pin-priority version trusted
// series.comicvine_volume_id pins unconditionally, but 448 distinct
// ComicVine volumes turned out to have MULTIPLE series rows pinned to
// DIFFERENT gcd_ids (a pre-existing duplicate-series data problem — e.g.
// ComicVine volume 796 "Batman" 1940 had twelve different series rows,
// each pinned to a different gcd_id). That version silently trusted
// whichever row the database happened to return last — non-deterministic,
// unverified — and got applied for real once (30,454 canonical_covers
// rows, including Batman, Spider-Man, Superman, Fantastic Four, Avengers)
// before the smoke test suite caught Absolute Batman showing the wrong
// issue count immediately after and this was traced back.
// repairAllCoverSeriesLinks.js itself is already fixed to never trust an
// ambiguous pin again (see its fetchPinnedGcdIdByVolume) — this script
// exists to fix the damage that one bad run already did, using a real,
// independent signal instead of guessing: ComicVine's own `start_year`
// for the volume, cross-referenced against each candidate gcd_id's
// gcd_series.year_began. An exact year match wins; anything else is left
// alone rather than guessed at — same "admit the gap, don't confidently
// guess wrong" posture as the rest of this pipeline.
//
// Rate-limited and resumable: ComicVine's free tier is ~200 req/hour,
// shared with the live hourly cover-ingest pipeline, so this defaults to
// a conservative --max-calls and skips volumes already resolved in a
// prior invocation (tracked in .ambiguous-pins-done.json, git-ignored
// scratch state — this is a one-time cleanup script, not part of the
// recurring pipeline, so it doesn't need a durable git-tracked ledger).
//
// Usage:
//   node scripts/resolveAmbiguousPins.js --dry-run
//   node scripts/resolveAmbiguousPins.js --max-calls=100
//   node scripts/resolveAmbiguousPins.js --max-calls=100 --apply

import dotenv from "dotenv";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const APPLY = process.argv.includes("--apply");
const maxCallsArg = process.argv.find((a) => a.startsWith("--max-calls="));
const MAX_CALLS = maxCallsArg ? Number(maxCallsArg.split("=")[1]) : 50;
const DONE_FILE = ".ambiguous-pins-done.json";
const PAGE = 1000;

const CV_API_KEY = process.env.COMICVINE_API_KEY;
const CV_SLEEP_MS = 1200; // ~50/min, well under the shared 200/hr ceiling

async function fetchAllPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

function loadDone() {
  try {
    return new Set(JSON.parse(fs.readFileSync(DONE_FILE, "utf8")));
  } catch {
    return new Set();
  }
}

function saveDone(set) {
  fs.writeFileSync(DONE_FILE, JSON.stringify([...set]));
}

async function fetchVolumeStartYear(volumeId) {
  const url = `https://comicvine.gamespot.com/api/volume/4050-${volumeId}/?api_key=${CV_API_KEY}&format=json&field_list=id,name,start_year`;
  const res = await fetch(url, { headers: { "User-Agent": "comixcatalog-pin-remediation/1.0" } });
  if (!res.ok) throw new Error(`ComicVine HTTP ${res.status}`);
  const json = await res.json();
  const year = json?.results?.start_year;
  return year ? Number(year) : null;
}

async function findAmbiguousVolumes() {
  const rows = await fetchAllPages(() =>
    supabase.from("series").select("comicvine_volume_id, gcd_id, title")
      .not("comicvine_volume_id", "is", null).not("gcd_id", "is", null)
  );
  const byVolume = new Map();
  for (const row of rows) {
    if (!byVolume.has(row.comicvine_volume_id)) byVolume.set(row.comicvine_volume_id, []);
    byVolume.get(row.comicvine_volume_id).push(row);
  }
  const ambiguous = [];
  for (const [volume, candidates] of byVolume) {
    const distinctGcdIds = new Set(candidates.map((c) => c.gcd_id));
    if (distinctGcdIds.size > 1) {
      ambiguous.push({ volume, title: candidates[0].title, gcdIds: [...distinctGcdIds] });
    }
  }
  return ambiguous;
}

async function run() {
  if (!CV_API_KEY) {
    console.error("COMICVINE_API_KEY missing from .env.local");
    process.exit(1);
  }

  console.log("Finding volumes with genuinely conflicting series.comicvine_volume_id pins...");
  const ambiguous = await findAmbiguousVolumes();
  console.log(`Total ambiguous volumes: ${ambiguous.length}`);

  const done = loadDone();
  const todo = ambiguous.filter((a) => !done.has(String(a.volume))).slice(0, MAX_CALLS);
  console.log(`Already resolved in a prior run: ${done.size}`);
  console.log(`Processing this run (max ${MAX_CALLS}): ${todo.length}`);

  let resolved = 0;
  let noConfidentWinner = 0;
  let apiErrors = 0;

  for (const { volume, title, gcdIds } of todo) {
    let startYear;
    try {
      startYear = await fetchVolumeStartYear(volume);
    } catch (err) {
      console.error(`  volume ${volume} (${title}): ComicVine fetch failed — ${err.message}`);
      apiErrors++;
      await new Promise((r) => setTimeout(r, CV_SLEEP_MS));
      continue;
    }
    await new Promise((r) => setTimeout(r, CV_SLEEP_MS));

    if (!startYear) {
      console.log(`  volume ${volume} (${title}): ComicVine has no start_year — skipping, can't confirm`);
      noConfidentWinner++;
      done.add(String(volume));
      continue;
    }

    const { data: gcdSeriesRows } = await supabase
      .from("gcd_series")
      .select("gcd_id, year_began")
      .in("gcd_id", gcdIds);

    const exactMatches = (gcdSeriesRows ?? []).filter((r) => r.year_began === startYear);
    if (exactMatches.length !== 1) {
      console.log(
        `  volume ${volume} (${title}, CV start_year=${startYear}): ` +
          `${exactMatches.length === 0 ? "no" : "multiple"} exact year match among ` +
          `[${(gcdSeriesRows ?? []).map((r) => `${r.gcd_id}:${r.year_began}`).join(", ")}] — skipping`
      );
      noConfidentWinner++;
      done.add(String(volume));
      continue;
    }

    const winner = exactMatches[0].gcd_id;
    console.log(`  volume ${volume} (${title}): CV start_year=${startYear} -> winner gcd_id=${winner}`);

    if (APPLY) {
      const { data, error } = await supabase
        .from("canonical_covers")
        .update({ series_gcd_id: winner })
        .eq("comicvine_volume_id", volume)
        .neq("series_gcd_id", winner)
        .select("id");
      if (error) {
        console.error(`    update failed: ${error.message}`);
        continue;
      }
      console.log(`    corrected ${data.length} row(s)`);
    }
    resolved++;
    done.add(String(volume));
  }

  saveDone(done);

  console.log(
    `\nDone this run: ${resolved} resolved, ${noConfidentWinner} skipped (no confident year match), ${apiErrors} API error(s).`
  );
  console.log(`Remaining unresolved: ${ambiguous.length - done.size}`);
  if (!APPLY) console.log("(dry run — pass --apply to write)");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
