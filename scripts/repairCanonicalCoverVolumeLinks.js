// Retag every canonical cover from one verified ComicVine volume to one
// verified GCD series. Dry-run by default; apply requires the exact row count.
// This is for cases where title/year matching fragmented one ComicVine run
// across shorter same-title GCD series.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createCoverMatcher } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const VOLUME_ID = Number(arg("volume-id"));
const SERIES_GCD_ID = Number(arg("series-gcd-id"));
const CONFIRMED_COUNT = arg("confirm") == null ? null : Number(arg("confirm"));

if (!Number.isSafeInteger(VOLUME_ID) || !Number.isSafeInteger(SERIES_GCD_ID)) {
  throw new Error("Usage: node scripts/repairCanonicalCoverVolumeLinks.js --volume-id=<id> --series-gcd-id=<id> [--apply --confirm=<rows>]");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const { resolveGcdIssueId } = createCoverMatcher(supabase);

async function run() {
  const [{ data: series, error: seriesError }, { data: covers, error: coversError }] =
    await Promise.all([
      supabase
        .from("gcd_series")
        .select("gcd_id, name, year_began, year_ended")
        .eq("gcd_id", SERIES_GCD_ID)
        .single(),
      supabase
        .from("canonical_covers")
        .select("id, series_title, issue_number, comicvine_volume_id, series_gcd_id, gcd_issue_id, match_confidence, storage_path")
        .eq("comicvine_volume_id", VOLUME_ID)
        .order("id"),
    ]);
  if (seriesError) throw seriesError;
  if (coversError) throw coversError;
  if (!covers?.length) throw new Error(`No covers found for ComicVine volume ${VOLUME_ID}`);

  const titleMismatches = covers.filter(
    (cover) => String(cover.series_title).trim().toLowerCase() !== String(series.name).trim().toLowerCase()
  );
  if (titleMismatches.length > 0) {
    throw new Error(`${titleMismatches.length} cover titles do not match target GCD series ${series.name}`);
  }

  const plan = [];
  const stats = { rows: covers.length, resolved: 0, seriesOnly: 0, unchanged: 0, updates: 0 };
  for (const cover of covers) {
    const issue = await resolveGcdIssueId({
      seriesGcdId: SERIES_GCD_ID,
      issueNumber: cover.issue_number,
    });
    if (issue.matchConfidence === "resolved") stats.resolved += 1;
    else stats.seriesOnly += 1;
    const after = {
      series_gcd_id: SERIES_GCD_ID,
      gcd_issue_id: issue.gcdIssueId,
      match_confidence: issue.matchConfidence,
    };
    const changed =
      Number(cover.series_gcd_id) !== SERIES_GCD_ID ||
      Number(cover.gcd_issue_id) !== Number(after.gcd_issue_id) ||
      cover.match_confidence !== after.match_confidence;
    if (changed) {
      stats.updates += 1;
      plan.push({ cover, after });
    } else {
      stats.unchanged += 1;
    }
  }

  console.log(APPLY ? "MODE: APPLY" : "MODE: DRY RUN");
  console.log(`ComicVine volume: ${VOLUME_ID}`);
  console.log(`Target GCD series: ${SERIES_GCD_ID} — ${series.name} (${series.year_began}-${series.year_ended})`);
  console.log(JSON.stringify(stats, null, 2));
  for (const row of plan.slice(0, 20)) {
    console.log(
      `  ${row.cover.issue_number}: series ${row.cover.series_gcd_id} -> ${row.after.series_gcd_id}; issue ${row.cover.gcd_issue_id} -> ${row.after.gcd_issue_id}; ${row.after.match_confidence}`
    );
  }

  if (!APPLY) {
    console.log("Dry run complete; no rows changed.");
    return;
  }
  if (!Number.isSafeInteger(CONFIRMED_COUNT) || CONFIRMED_COUNT !== covers.length) {
    throw new Error(`Apply requires --confirm=${covers.length}; received ${CONFIRMED_COUNT}`);
  }

  let applied = 0;
  for (const row of plan) {
    const { error } = await supabase
      .from("canonical_covers")
      .update(row.after)
      .eq("id", row.cover.id)
      .eq("comicvine_volume_id", VOLUME_ID);
    if (error) throw new Error(`cover ${row.cover.id} update failed: ${error.message}`);
    applied += 1;
  }
  console.log(`Apply complete: ${applied} rows updated; ${stats.unchanged} already correct.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
