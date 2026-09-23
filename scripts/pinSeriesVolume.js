// Pin one GCD series to one ComicVine volume, by hand, with the evidence
// checked before it writes.
//
// The ingest resolves a volume by searching ComicVine for the GCD title. When
// the two databases spell a run differently, that search returns nothing and
// the target is recorded as `no_title_match` — ComicVine has the book, we
// just asked for the wrong string. docs/cover-ingestion-next-steps.md calls
// this Class B and says it needs "incremental, evidence-based alias-table
// additions". This is that path: a human finds the right volume, this script
// checks the evidence and writes the pin.
//
// Live examples it was built from (2026-09-23), both blanks in a real user's
// library:
//   GCD 4208 "Robin II" (1991)          -> cv 4564  "Robin II: The Joker's Wild!"
//   GCD 7799 "Fantastic Four: World's   -> cv 30423 "Fantastic Four: The
//            Greatest Comics Magazine"                World's Greatest Comics Magazine"
// One is missing a subtitle, the other a single "The". Neither would ever be
// found by an exact-title search.
//
// It refuses by default when the evidence disagrees, because a confident
// wrong pin is the expensive failure here: it attaches a whole volume's
// covers to the wrong book, which is worse than the blank it replaces (see
// the wrong-cover fallback killed sitewide in August).
//
// Usage:
//   node scripts/pinSeriesVolume.js --gcd-id=4208 --volume-id=4564
//   node scripts/pinSeriesVolume.js --gcd-id=4208 --volume-id=4564 --apply
//   ... --force to pin anyway when a check fails (say why in the commit).

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  })
);
const GCD_ID = Number(args["gcd-id"]);
const VOLUME_ID = Number(args["volume-id"]);
const APPLY = Boolean(args.apply);
const FORCE = Boolean(args.force);

if (!Number.isInteger(GCD_ID) || !Number.isInteger(VOLUME_ID)) {
  console.error("usage: node scripts/pinSeriesVolume.js --gcd-id=<n> --volume-id=<n> [--apply] [--force]");
  process.exit(2);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const CV_KEY = process.env.COMICVINE_API_KEY;

// GCD lists one row per printing, so a series with variant covers has more
// gcd_issues rows than issues. Robin II is 18 rows and 4 issues. Comparing
// raw row counts against ComicVine's count_of_issues would reject a correct
// pin, so compare distinct base issue numbers.
function baseIssueNumber(value) {
  const m = String(value ?? "").trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

async function main() {
  if (!CV_KEY) throw new Error("COMICVINE_API_KEY is not set");

  const { data: series, error } = await supabase
    .from("series")
    .select("gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached, comicvine_volume_id")
    .eq("gcd_id", GCD_ID)
    .maybeSingle();
  if (error) throw new Error(`series lookup: ${error.code} | ${error.message}`);
  if (!series) throw new Error(`no series row with gcd_id ${GCD_ID}`);

  const { data: issueRows, error: issueError } = await supabase
    .from("gcd_issues")
    .select("issue_number")
    .eq("series_gcd_id", GCD_ID)
    .limit(1000);
  if (issueError) throw new Error(`gcd_issues: ${issueError.code} | ${issueError.message}`);
  const gcdIssues = new Set((issueRows ?? []).map((r) => baseIssueNumber(r.issue_number)).filter(Boolean));

  const res = await fetch(
    `https://comicvine.gamespot.com/api/volume/4050-${VOLUME_ID}/?api_key=${CV_KEY}&format=json&field_list=id,name,start_year,count_of_issues,publisher`,
    { headers: { "User-Agent": "ComixCatalog/1.0 (manual volume pin)" } }
  );
  if (!res.ok) throw new Error(`ComicVine returned ${res.status}`);
  const json = await res.json();
  const vol = json?.results;
  if (!vol?.id) throw new Error(`ComicVine has no volume ${VOLUME_ID}`);

  console.log("GCD series");
  console.log(`  ${series.gcd_id}  ${series.title}`);
  console.log(`  ${series.year_start_cached ?? "?"}-${series.year_end_cached ?? "?"}  ${series.resolved_publisher_cached ?? "?"}`);
  console.log(`  ${gcdIssues.size} distinct issue numbers (${issueRows?.length ?? 0} rows, printings included)`);
  console.log(`  current pin: ${series.comicvine_volume_id ?? "none"}`);
  console.log("");
  console.log("ComicVine volume");
  console.log(`  ${vol.id}  ${vol.name}`);
  console.log(`  ${vol.start_year ?? "?"}  ${(vol.publisher || {}).name ?? "?"}`);
  console.log(`  ${vol.count_of_issues ?? "?"} issues`);
  console.log("");

  const problems = [];
  const startYear = Number(series.year_start_cached);
  const cvYear = Number(vol.start_year);
  if (Number.isFinite(startYear) && Number.isFinite(cvYear) && Math.abs(startYear - cvYear) > 1) {
    problems.push(`start years differ by ${Math.abs(startYear - cvYear)} (GCD ${startYear}, CV ${cvYear})`);
  }

  const cvCount = Number(vol.count_of_issues);
  if (Number.isFinite(cvCount) && gcdIssues.size > 0) {
    const ratio = Math.min(cvCount, gcdIssues.size) / Math.max(cvCount, gcdIssues.size);
    if (ratio < 0.7) {
      problems.push(`issue counts disagree (GCD ${gcdIssues.size} distinct, CV ${cvCount})`);
    }
  }

  const gcdPub = String(series.resolved_publisher_cached ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const cvPub = String((vol.publisher || {}).name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (gcdPub && cvPub && !gcdPub.startsWith(cvPub) && !cvPub.startsWith(gcdPub)) {
    problems.push(`publishers differ (GCD "${series.resolved_publisher_cached}", CV "${(vol.publisher || {}).name}")`);
  }

  // A volume already claimed by another series is how the 616-shared-pin mess
  // got made. Say so loudly — sometimes it is legitimate (a run renamed
  // mid-stream, see splitVolumeCoversByIssueRange.js) and sometimes it is a
  // second wrong pin about to be created.
  const { data: alreadyPinned } = await supabase
    .from("series")
    .select("gcd_id, title, year_start_cached")
    .eq("comicvine_volume_id", VOLUME_ID)
    .neq("gcd_id", GCD_ID);
  if (alreadyPinned?.length) {
    console.log("Already pinned to this volume:");
    for (const p of alreadyPinned) console.log(`  ${p.gcd_id}  ${p.title} (${p.year_start_cached ?? "?"})`);
    console.log("  If that is a mid-run rename this is fine; run splitVolumeCoversByIssueRange.js after ingest.");
    console.log("");
  }

  if (problems.length) {
    console.log("EVIDENCE PROBLEMS:");
    for (const p of problems) console.log(`  - ${p}`);
    if (!FORCE) {
      console.log("\nRefusing to pin. Re-run with --force if you have checked it by hand.");
      process.exitCode = 1;
      return;
    }
    console.log("\n--force given; pinning anyway.");
  } else {
    console.log("Evidence agrees: year, publisher and issue count all line up.");
  }

  if (!APPLY) {
    console.log("\n[dry run] Nothing written. Re-run with --apply.");
    return;
  }

  const { error: writeError } = await supabase
    .from("series")
    .update({ comicvine_volume_id: VOLUME_ID, search_refreshed_at: null })
    .eq("gcd_id", GCD_ID);
  if (writeError) throw new Error(`pin write: ${writeError.code} | ${writeError.message}`);
  console.log(`\nPinned GCD ${GCD_ID} -> ComicVine volume ${VOLUME_ID}.`);
  console.log("Queued for a search-cache refresh. The pinned ingest lane will pick up its covers.");
}

main().catch((err) => {
  console.error(`pinSeriesVolume failed: ${err?.message ?? err}`);
  process.exit(1);
});
