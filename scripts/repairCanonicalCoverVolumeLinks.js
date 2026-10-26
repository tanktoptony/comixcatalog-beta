// Retag every canonical cover from one verified ComicVine volume to one
// verified GCD series. Dry-run by default; apply requires the exact row count.
// This is for cases where title/year matching fragmented one ComicVine run
// across shorter same-title GCD series.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createCoverMatcher } from "../src/lib/coverMatch.js";
import { titleVariants, toTitleNormalizedKey } from "../src/lib/catalogLinkMatcher.js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const VOLUME_ID = Number(arg("volume-id"));
const SERIES_GCD_ID = Number(arg("series-gcd-id"));
const CONFIRMED_COUNT = arg("confirm") == null ? null : Number(arg("confirm"));
// --move-pin also moves series.comicvine_volume_id: cleared on other series
// pinned to this volume, set on the target when it has no pin. A wrong pin
// is how the ingest kept attaching Wonder Woman (1987) covers to a one-book
// 1995 Abbeville "Wonder Woman" (2026-10-26), so moving covers alone would
// not stick.
const MOVE_PIN = process.argv.includes("--move-pin");

if (!Number.isSafeInteger(VOLUME_ID) || !Number.isSafeInteger(SERIES_GCD_ID)) {
  throw new Error("Usage: node scripts/repairCanonicalCoverVolumeLinks.js --volume-id=<id> --series-gcd-id=<id> [--move-pin] [--apply --confirm=<rows>]");
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

  // Same normalization the catalog linker uses, so "The Amazing Spider-Man"
  // (ComicVine) matches GCD "Amazing Spider-Man" and "X-Men: Red" matches
  // "X-Men Red". An exact comparison refused most real relinks (2026-10-26).
  const targetKey = toTitleNormalizedKey(series.name);
  const titleMismatches = covers.filter(
    (cover) => !titleVariants(cover.series_title).includes(targetKey)
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

  let pinPlan = { clear: [], set: null };
  if (MOVE_PIN) {
    const { data: pinned, error: pinnedError } = await supabase
      .from("series")
      .select("id, gcd_id, title, comicvine_volume_id")
      .or(`comicvine_volume_id.eq.${VOLUME_ID},gcd_id.eq.${SERIES_GCD_ID}`);
    if (pinnedError) throw pinnedError;
    const target = pinned.find((row) => Number(row.gcd_id) === SERIES_GCD_ID);
    // A target pinned to another volume keeps that pin only if some of that
    // volume's covers are on the target. Wonder Woman (1987) was pinned to the
    // 1942 volume, whose covers all sit on the 1942 series.
    let replace = false;
    const oldPin = target?.comicvine_volume_id == null ? null : Number(target.comicvine_volume_id);
    if (oldPin != null && oldPin !== VOLUME_ID) {
      const { count, error } = await supabase.from("canonical_covers")
        .select("id", { count: "exact", head: true })
        .eq("comicvine_volume_id", oldPin).eq("series_gcd_id", SERIES_GCD_ID);
      if (error) throw error;
      replace = count === 0;
      console.log(`  pin: target pinned to ${oldPin} with ${count} of its covers; ${replace ? "replacing" : "leaving it"}`);
    }
    pinPlan = {
      clear: pinned.filter((row) => Number(row.gcd_id) !== SERIES_GCD_ID && Number(row.comicvine_volume_id) === VOLUME_ID),
      set: target && (oldPin == null || replace) ? target : null,
      from: oldPin,
    };
    for (const row of pinPlan.clear) console.log(`  pin: clear ${VOLUME_ID} from series ${row.gcd_id} "${row.title}"`);
    if (pinPlan.set) console.log(`  pin: set ${VOLUME_ID} on series ${SERIES_GCD_ID}`);
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

  for (const row of pinPlan.clear) {
    const { error } = await supabase.from("series").update({ comicvine_volume_id: null })
      .eq("id", row.id).eq("comicvine_volume_id", VOLUME_ID);
    if (error) throw new Error(`series ${row.gcd_id} pin clear failed: ${error.message}`);
  }
  if (pinPlan.set) {
    let update = supabase.from("series").update({ comicvine_volume_id: VOLUME_ID }).eq("id", pinPlan.set.id);
    update = pinPlan.from == null ? update.is("comicvine_volume_id", null) : update.eq("comicvine_volume_id", pinPlan.from);
    const { error } = await update;
    if (error) throw new Error(`series ${SERIES_GCD_ID} pin set failed: ${error.message}`);
  }
  if (MOVE_PIN) console.log(`Pins: cleared ${pinPlan.clear.length}, set ${pinPlan.set ? 1 : 0}.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
