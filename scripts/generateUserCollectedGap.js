// scripts/generateUserCollectedGap.js
//
// Builds gap-user-collected.json: only series that at least one user has
// added to their library AND that don't yet have a featured cover.
// This is the only ingest target that directly affects what real users
// see in their library or on shared profile links.
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

  // 2. Map those issues to their series_gcd_id.
  const issueRows = [];
  for (let i = 0; i < uniqueIssueIds.length; i += PAGE) {
    const slice = uniqueIssueIds.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id")
      .in("gcd_id", slice);
    if (error) throw error;
    issueRows.push(...(data ?? []));
  }
  const seriesGcdIds = [
    ...new Set(issueRows.map((r) => r.series_gcd_id).filter(Boolean)),
  ];
  console.log(`Distinct series users have collected from: ${seriesGcdIds.length}`);

  // 3. Pull series rows + cached cover state. Skip ones that already have a
  //    featured_cover_path_cached — those aren't a gap.
  const seriesRows = [];
  for (let i = 0; i < seriesGcdIds.length; i += PAGE) {
    const slice = seriesGcdIds.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from("series")
      .select(
        "id, title, resolved_publisher_cached, year_start_cached, featured_cover_path_cached"
      )
      .in("gcd_id", slice);
    if (error) throw error;
    seriesRows.push(...(data ?? []));
  }
  console.log(`Series rows resolved: ${seriesRows.length}`);

  const withCover = seriesRows.filter((s) => s.featured_cover_path_cached).length;
  const gaps = seriesRows.filter((s) => !s.featured_cover_path_cached);
  console.log(
    `  already have featured cover: ${withCover} (${((withCover / seriesRows.length) * 100).toFixed(1)}%)`
  );
  console.log(`  missing featured cover (= gap): ${gaps.length}`);

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
