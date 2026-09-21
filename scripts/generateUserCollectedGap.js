// scripts/generateUserCollectedGap.js
//
// Builds gap-user-collected.json: only series that at least one user has
// added to their library AND that still have at least one *owned issue*
// without a cover. This is the only ingest target that directly affects
// what real users see in their library or on shared profile links.
//
// Issue-level, not series-level (changed 2026-09-20): this used to gap on
// `series.featured_cover_path_cached` alone, i.e. "does this series have
// any one cover at all". That is far too coarse for the thing users
// actually see. Measured on 2026-09-20: 157 of 173 user-collected series
// had a featured cover, so the file held 15 targets — while
// scripts/reportUserCollectedCoverCoverage.js showed 557 of 662 owned
// issues with no cover (15.86% coverage). The New Warriors, Amazing
// Spider-Man, Silver Surfer and Fantastic Four were each missing 30-40
// owned issues and were all excluded from this file because the series
// happened to own a single featured cover. The test below now matches
// that report script's metric exactly, and follows the same "ANY issue
// missing" rule scripts/generateUserGap.js has always used.
// The ingester's --skip-existing is per-issue, so re-walking a volume we
// partially cover is cheap and fills exactly these holes.
//
// Why this exists: the existing gap-width / gap-depth files surface
// catalog-wide gaps, but the long tail there is dominated by
// untracked-by-ComicVine ephemera (True Believers reprints, Walmart
// exclusives, UK weeklies, retailer one-shots). Spending the 200/hr
// ComicVine budget on those is wasted motion — they'll never resolve.
//
// Usage:
//   node scripts/generateUserCollectedGap.js
//   node scripts/generateUserCollectedGap.js --include-pattern-filter
//
// The --include-pattern-filter flag additionally strips known-garbage
// title patterns (omnibus / compendium / wal-mart / true believers /
// box set / deluxe edition). Off by default so we don't accidentally
// drop a legit "Daredevil Omnibus" if someone owns it.

import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Patterns that almost never resolve in ComicVine. The script logs how
// many were dropped so you can see if the filter is too aggressive for
// your actual user base.
const GARBAGE_PATTERNS = [
  /\bomnibus\b/i,
  /\bcompendium\b/i,
  /\btrue believers?\b/i,
  /\bwal-?mart\b/i,
  /\bbox set\b/i,
  /\bdeluxe edition\b/i,
  /\bspecial edition\b/i,
  /\bcollectible classics\b/i,
  /\b(free comic book day)\b/i,
  /\bsketchbook\b/i,
];

const args = new Set(process.argv.slice(2));
const PAGE = 1000;
// PostgREST chokes on very long `in.(...)` lists in a URL, so the
// canonical_covers lookups below go out in chunks rather than one request
// with every series id inline.
const COVER_CHUNK = 100;

const norm = (value) => String(value ?? "").trim().toLowerCase();

async function paginate(builder) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await builder().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function main() {
  console.log("\n=== generateUserCollectedGap ===\n");

  // 1. Distinct gcd_issue_ids any user has collected.
  const collected = await paginate(() =>
    supabase
      .from("user_collections")
      .select("gcd_issue_id")
      .not("gcd_issue_id", "is", null)
      .order("gcd_issue_id")
  );
  const uniqueIssueIds = [...new Set(collected.map((r) => r.gcd_issue_id))];
  console.log(`User-collected distinct issues: ${uniqueIssueIds.length}`);

  if (uniqueIssueIds.length === 0) {
    console.log("No user-collected issues. Nothing to do.");
    fs.writeFileSync("gap-user-collected.json", "[]", "utf-8");
    return;
  }

  // 2. Map those issues to their series_gcd_id. issue_number comes along
  //    too — the gap test in step 5 is per-issue, not per-series.
  const issueRows = [];
  for (let i = 0; i < uniqueIssueIds.length; i += PAGE) {
    const slice = uniqueIssueIds.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number")
      .in("gcd_id", slice);
    if (error) throw error;
    issueRows.push(...(data ?? []));
  }
  const seriesGcdIds = [
    ...new Set(issueRows.map((r) => r.series_gcd_id).filter(Boolean)),
  ];
  console.log(`Distinct series users have collected from: ${seriesGcdIds.length}`);

  // 3. Pull series rows + cached cover state. gcd_id is selected (not just
  //    id) because steps 4-5 join owned issues back to their series by it.
  const seriesRows = [];
  for (let i = 0; i < seriesGcdIds.length; i += PAGE) {
    const slice = seriesGcdIds.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("series")
      .select(
        "id, gcd_id, title, resolved_publisher_cached, year_start_cached, featured_cover_path_cached"
      )
      .in("gcd_id", slice);
    if (error) throw error;
    seriesRows.push(...(data ?? []));
  }
  console.log(`Series rows resolved: ${seriesRows.length}`);
  const seriesByGcdId = new Map(seriesRows.map((s) => [Number(s.gcd_id), s]));

  // 4. Which (series, issue_number) pairs already have a real cover? Two
  //    lookups, mirroring reportUserCollectedCoverCoverage.js: by
  //    series_gcd_id (the correct link) and by series_title (the fallback
  //    for covers whose gcd_id backfill never ran). A cover found either
  //    way is a cover the user sees, so both count.
  const coverBySeriesId = new Set();
  const coverByTitle = new Set();
  for (let i = 0; i < seriesGcdIds.length; i += COVER_CHUNK) {
    const slice = seriesGcdIds.slice(i, i + COVER_CHUNK);
    const rows = await paginate(() =>
      supabase
        .from("canonical_covers")
        .select("series_gcd_id, series_title, issue_number")
        .in("series_gcd_id", slice)
        .not("storage_path", "is", null)
        .order("id")
    );
    for (const cover of rows) {
      coverBySeriesId.add(
        `${Number(cover.series_gcd_id)}::${norm(cover.issue_number)}`
      );
      coverByTitle.add(`${norm(cover.series_title)}::${norm(cover.issue_number)}`);
    }
  }
  const seriesTitles = [
    ...new Set(seriesRows.map((s) => s.title).filter(Boolean)),
  ];
  for (let i = 0; i < seriesTitles.length; i += COVER_CHUNK) {
    const slice = seriesTitles.slice(i, i + COVER_CHUNK);
    const rows = await paginate(() =>
      supabase
        .from("canonical_covers")
        .select("series_title, issue_number")
        .in("series_title", slice)
        .not("storage_path", "is", null)
        .order("id")
    );
    for (const cover of rows) {
      coverByTitle.add(`${norm(cover.series_title)}::${norm(cover.issue_number)}`);
    }
  }

  // 5. A series is a gap if ANY issue a user actually owns from it has no
  //    cover. Same rule as generateUserGap.js: a run that covers #1-50 but
  //    not #75 is still a gap, and --skip-existing makes re-walking it cheap.
  const gapSeriesGcdIds = new Set();
  let missingIssueCount = 0;
  for (const issue of issueRows) {
    const series = seriesByGcdId.get(Number(issue.series_gcd_id));
    if (!series) continue;
    const hasCover =
      coverBySeriesId.has(
        `${Number(issue.series_gcd_id)}::${norm(issue.issue_number)}`
      ) || coverByTitle.has(`${norm(series.title)}::${norm(issue.issue_number)}`);
    if (!hasCover) {
      missingIssueCount += 1;
      gapSeriesGcdIds.add(Number(issue.series_gcd_id));
    }
  }
  const issueLevelGapSeries = gapSeriesGcdIds.size;

  // Keep the old series-level criterion as a union member, not a
  // replacement: a series with no featured cover at all is still worth a
  // pass even in the unlikely case every owned issue already resolved.
  const noFeaturedCover = seriesRows.filter(
    (s) => !s.featured_cover_path_cached
  ).length;
  for (const series of seriesRows) {
    if (!series.featured_cover_path_cached) {
      gapSeriesGcdIds.add(Number(series.gcd_id));
    }
  }

  const gaps = seriesRows.filter((s) => gapSeriesGcdIds.has(Number(s.gcd_id)));
  console.log(
    `Owned issues with no cover: ${missingIssueCount} of ${issueRows.length}`
  );
  console.log(`  series with >=1 uncovered owned issue: ${issueLevelGapSeries}`);
  console.log(`  series with no featured cover at all:  ${noFeaturedCover}`);
  console.log(`  gap series (union of both):            ${gaps.length}`);

  // 4. Build the ingester target entries. Skip rows missing publisher or
  //    title (ingester can't search without them).
  let targets = gaps
    .filter((s) => s.title && s.resolved_publisher_cached)
    .map((s) => ({
      name: s.title,
      publisher: s.resolved_publisher_cached,
      year: s.year_start_cached ?? null,
    }));

  if (args.has("--include-pattern-filter")) {
    const before = targets.length;
    targets = targets.filter(
      (t) => !GARBAGE_PATTERNS.some((re) => re.test(t.name))
    );
    console.log(
      `  pattern filter: dropped ${before - targets.length} known-garbage entries (omnibus/wal-mart/true believers/etc)`
    );
  }

  // De-dup by (name, publisher, year) — same title+publisher+year combo
  // shouldn't appear twice.
  const seen = new Set();
  targets = targets.filter((t) => {
    const key = `${t.name}::${t.publisher}::${t.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (args.has("--append-to-manual")) {
    // Auto-append mode: merge into gap-manual.json instead of writing a
    // separate file. Used by the weekly auto-gap GHA so user-collected
    // series get picked up by the next cover-ingest cycle without a
    // human in the loop. Dedupes by (name, publisher, year) against
    // existing gap-manual entries.
    const manualPath = "gap-manual.json";
    let existing = [];
    try { existing = JSON.parse(fs.readFileSync(manualPath, "utf-8")); } catch {}
    const existingKeys = new Set(
      existing.map((e) => `${e.name}::${e.publisher}::${e.year}`)
    );
    const additions = targets.filter(
      (t) => !existingKeys.has(`${t.name}::${t.publisher}::${t.year}`)
    );
    if (additions.length === 0) {
      console.log("\nNothing new to append to gap-manual.json.");
      return;
    }
    const merged = [...existing, ...additions];
    fs.writeFileSync(manualPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    console.log(`\nAppended ${additions.length} new target(s) to gap-manual.json (now ${merged.length}).`);
    return;
  }

  fs.writeFileSync("gap-user-collected.json", JSON.stringify(targets, null, 2), "utf-8");

  console.log(`\nWrote gap-user-collected.json — ${targets.length} target(s).`);
  console.log("\nRun the ingester:");
  console.log("  python comicvine_api_to_supabase.py --targets gap-user-collected.json --skip-existing --max-search-calls 180 --vol-sleep 1.0\n");
}

main().catch((err) => {
  console.error("generateUserCollectedGap failed:", err);
  process.exit(1);
});
