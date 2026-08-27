// Generate a targets JSON for comicvine_api_to_supabase.py based on real gaps.
//
// What it does:
//   1. Queries `series` for rows missing `featured_cover_path_cached`
//      with high `issue_count_cached` and a US-allowlist publisher.
//   2. Writes them as `[{name, publisher, year}, ...]` to a JSON file
//      that comicvine_api_to_supabase.py consumes via --targets.
//
// Then you run:
//   python comicvine_api_to_supabase.py --targets gap-targets.json --skip-existing
//
// Why this beats the old hardcoded TARGET_VOLUMES list:
//   The hardcoded list is human-curated guesses. This is data-driven — we
//   target series the cache already KNOWS lack covers, ranked by issue count
//   so popular runs get filled first. Re-runs are idempotent (skip-existing).
//
// Usage:
//   node scripts/generateCoverGapTargets.js                     → top 200 gaps, depth mode
//   node scripts/generateCoverGapTargets.js --mode=depth        → popular series first (default)
//   node scripts/generateCoverGapTargets.js --mode=width        → small series first, percentage-mover
//   node scripts/generateCoverGapTargets.js --mode=both         → writes gap-depth.json AND gap-width.json
//   node scripts/generateCoverGapTargets.js --limit=500         → cap output
//   node scripts/generateCoverGapTargets.js --min-issues=5      → tighten floor
//   node scripts/generateCoverGapTargets.js --out=foo.json      → custom output (single-mode only)
//
// Modes:
//   depth — issue_count >= 20, ORDER BY issue_count DESC. Same series as before.
//           Each match fills in many issues. Slow % movement, high user impact.
//   width — issue_count >= 5, ORDER BY issue_count ASC. Small series, many hits.
//           Fast % movement, lower per-match impact. Pair with depth for combo runs.
//
// Output: gap-targets.json (or gap-depth.json + gap-width.json in --mode=both).

import dotenv from "dotenv";
import path from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
);

const LIMIT = Number(args.limit ?? 200);
const MODE = String(args.mode ?? "depth"); // "depth" | "width" | "both"

const MODE_PRESETS = {
  // Popular series first. Each match fills many issues, low % movement.
  depth: { minIssues: 20, order: { column: "issue_count_cached", ascending: false } },
  // Every series with at least one issue. Maximises the candidate pool — was 5,
  // now 1 to sweep up one-shots, specials, and short minis the previous floor
  // was hiding. Order by issue_count ASC so the smallest still go first; that
  // keeps each match cheap (few API calls) and the % needle moves fastest.
  width: { minIssues: 1, order: { column: "issue_count_cached", ascending: true } },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Series already logged in needs_volume_id.json failed a real ComicVine
// lookup once (publisher mismatch or an unresolved multi-candidate tie).
// Re-emitting them into gap-width/gap-depth every regeneration just burns
// the same search calls on the same guaranteed-skip targets again — worse,
// with a fixed --limit, a growing backlog of permanent failures crowds out
// fresh candidates that could actually succeed. Anything in the backlog is
// either being handled by scripts/resolveNeedsVolumeIdBacklog.js (single
// candidate → pinned into gap-pinned.json) or is a genuine unresolved case
// that re-attempting here won't fix either way.
function loadExclusionKeys() {
  const backlogPath = path.resolve(__dirname, "..", "needs_volume_id.json");
  if (!existsSync(backlogPath)) return new Set();
  const backlog = JSON.parse(readFileSync(backlogPath, "utf8"));
  return new Set(backlog.map((e) => `${e.name} ${e.publisher}`));
}

async function runMode(modeName, outPath, excludeKeys) {
  const preset = MODE_PRESETS[modeName];
  if (!preset) {
    console.error(`Unknown mode: ${modeName}. Valid: depth, width.`);
    process.exit(2);
  }

  // --min-issues from the CLI overrides the mode preset (advanced users).
  const minIssues =
    args["min-issues"] != null ? Number(args["min-issues"]) : preset.minIssues;

  console.log(`\n══════ ${modeName.toUpperCase()} ══════`);
  console.log(
    `  US publishers, no featured_cover, issue_count >= ${minIssues}, ` +
      `order ${preset.order.column} ${preset.order.ascending ? "ASC" : "DESC"}`
  );
  console.log(`  Top ${LIMIT} matches\n`);

  // Pull series that are visible in browse (US allowlist + has issues) but
  // lack a featured cover. Depth-mode prefers big runs (high user impact);
  // width-mode prefers small runs (% needle movement).
  //
  // Over-fetch beyond LIMIT so filtering out known-dead-end backlog entries
  // (see loadExclusionKeys) still leaves a full LIMIT of fresh candidates,
  // instead of silently shrinking the output every time the backlog grows.
  //
  // PostgREST silently caps any query without explicit .range() at 1000
  // rows regardless of .limit() — see CLAUDE.md's engineering reminders,
  // this has bitten two other scripts already. Paginate in 1000-row pages
  // up to FETCH_LIMIT instead of trusting .limit() alone.
  const FETCH_LIMIT = Math.min(LIMIT * 3, 10000);
  const PAGE = 1000;
  const data = [];
  for (let from = 0; from < FETCH_LIMIT; from += PAGE) {
    const to = Math.min(from + PAGE, FETCH_LIMIT) - 1;
    const { data: page, error } = await supabase
      .from("series")
      .select("id, title, resolved_publisher_cached, year_start_cached, issue_count_cached")
      .is("featured_cover_path_cached", null)
      .gte("issue_count_cached", minIssues)
      .in("resolved_publisher_cached", US_PUBLISHER_ALLOWLIST)
      .not("title", "is", null)
      .order(preset.order.column, { ascending: preset.order.ascending })
      .range(from, to);

    if (error) {
      console.error("Query failed:", error);
      process.exit(1);
    }
    data.push(...page);
    if (page.length < PAGE) break;
  }

  console.log(`Got ${data.length} candidate series (before exclusions).`);

  const filtered = data.filter(
    (s) => !excludeKeys.has(`${s.title} ${s.resolved_publisher_cached}`)
  );
  const excludedCount = data.length - filtered.length;
  if (excludedCount > 0) {
    console.log(`Excluded ${excludedCount} already in needs_volume_id.json's backlog.`);
  }

  const targets = filtered.slice(0, LIMIT).map((s) => ({
    name: s.title,
    publisher: s.resolved_publisher_cached,
    year: s.year_start_cached,
    _meta: {
      series_id: s.id,
      issue_count: s.issue_count_cached,
    },
  }));

  console.log("\nTop 10 targets (preview):");
  for (const t of targets.slice(0, 10)) {
    const yr = t.year ?? "?";
    console.log(
      `  ${String(t._meta.issue_count).padStart(4)} issues  ` +
        `${(t.publisher ?? "(unknown)").padEnd(24)}  ` +
        `(${yr})  ${t.name}`
    );
  }
  if (targets.length > 10) {
    console.log(`  ... and ${targets.length - 10} more`);
  }

  const clean = targets.map(({ _meta, ...rest }) => rest);
  writeFileSync(outPath, JSON.stringify(clean, null, 2));
  console.log(`\nWrote ${clean.length} targets → ${outPath}`);
  return clean.length;
}

async function run() {
  // --out forces a single file path and only makes sense for single-mode runs.
  if (MODE === "both" && args.out) {
    console.error("--out conflicts with --mode=both (two files produced).");
    process.exit(2);
  }

  const excludeKeys = loadExclusionKeys();
  if (excludeKeys.size > 0) {
    console.log(`Loaded ${excludeKeys.size} known-mismatch series to exclude from needs_volume_id.json.`);
  }

  if (MODE === "both") {
    const depthOut = path.resolve(__dirname, "..", "gap-depth.json");
    const widthOut = path.resolve(__dirname, "..", "gap-width.json");
    const depthCount = await runMode("depth", depthOut, excludeKeys);
    const widthCount = await runMode("width", widthOut, excludeKeys);

    console.log("\n══════ NEXT STEPS ══════");
    console.log("Run these in two terminals. They share the ComicVine rate budget");
    console.log("but proceed independently:\n");
    console.log(`  python comicvine_api_to_supabase.py --targets gap-depth.json --skip-existing`);
    console.log(`  python comicvine_api_to_supabase.py --targets gap-width.json --skip-existing`);
    console.log(`\n  depth: ${depthCount} targets   width: ${widthCount} targets`);
    return;
  }

  const outPath = path.resolve(
    __dirname,
    "..",
    args.out ?? `gap-${MODE}.json`
  );
  const count = await runMode(MODE, outPath, excludeKeys);

  console.log(`\nNext step:`);
  console.log(
    `  python comicvine_api_to_supabase.py --targets ${path.basename(outPath)} --skip-existing`
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
