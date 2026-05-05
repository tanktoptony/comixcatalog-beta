// Find which series in the DB have the worst per-issue cover coverage and
// emit a Python-pasteable target list for comicvine_api_to_supabase.py.
//
// Strategy:
//   1. Load all series with a gcd_id and at least MIN_ISSUES gcd_issues.
//   2. For each, count how many of its issues have a matching row in
//      canonical_covers (by series_title + issue_number + series_year ±1).
//   3. Rank by uncovered issue count (worst gaps first) and print:
//      - human summary
//      - Python list ready to paste into TARGET_VOLUMES
//      - JSON file the Python script can read directly with --targets
//
// Usage:
//   node scripts/findUncoveredSeries.js                 # default top 50
//   node scripts/findUncoveredSeries.js --top 200       # top 200
//   node scripts/findUncoveredSeries.js --min-issues 20 # only series ≥20 issues
//   node scripts/findUncoveredSeries.js --user-only     # only series in user_collections
//   node scripts/findUncoveredSeries.js --out targets.json
//
// No writes to the DB — read-only.

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const next = args[i + 1];
  if (next == null || next.startsWith("--")) return true;
  return next;
}

const TOP = Number(flag("top", 50));
const MIN_ISSUES = Number(flag("min-issues", 5));
const USER_ONLY = Boolean(flag("user-only", false));
const OUT_FILE = flag("out", path.resolve(__dirname, "pending_volumes.json"));
const YEAR_TOLERANCE = 1;
const PAGE_SIZE = 1000;

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}
function parseYear(value) {
  if (!value) return null;
  const m = String(value).match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

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
  console.log("Loading series with gcd_id…");
  const seriesRows = await paginate(() =>
    supabase
      .from("series")
      .select("id, gcd_id, title, year_start_cached, year_end_cached, issue_count_cached, resolved_publisher_cached")
      .not("gcd_id", "is", null)
      .gte("issue_count_cached", MIN_ISSUES)
  );
  console.log(`  ${seriesRows.length} series with ≥${MIN_ISSUES} issues`);

  let userSeriesIds = null;
  if (USER_ONLY) {
    console.log("Loading series referenced by user_collections (via gcd_issue_id → series_gcd_id)…");
    const collections = await paginate(() =>
      supabase.from("user_collections").select("gcd_issue_id, comic_id").not("gcd_issue_id", "is", null)
    );
    const gcdIds = [...new Set(collections.map((c) => c.gcd_issue_id).filter(Boolean))];
    if (gcdIds.length > 0) {
      const issues = [];
      for (let i = 0; i < gcdIds.length; i += 500) {
        const batch = gcdIds.slice(i, i + 500);
        const { data } = await supabase
          .from("gcd_issues")
          .select("series_gcd_id")
          .in("gcd_id", batch);
        if (data) issues.push(...data);
      }
      const seriesGcdIds = new Set(issues.map((r) => r.series_gcd_id).filter(Boolean));
      userSeriesIds = new Set(
        seriesRows.filter((s) => seriesGcdIds.has(s.gcd_id)).map((s) => s.id)
      );
      console.log(`  ${userSeriesIds.size} of those are user-touched`);
    }
  }

  const targets = USER_ONLY && userSeriesIds
    ? seriesRows.filter((s) => userSeriesIds.has(s.id))
    : seriesRows;

  console.log(`\nLoading canonical_covers (title + year + issue_number + storage_path)…`);
  const ccRows = await paginate(() =>
    supabase
      .from("canonical_covers")
      .select("series_title, series_year, cover_date, issue_number, storage_path")
      .not("storage_path", "is", null)
  );
  console.log(`  ${ccRows.length} canonical_covers rows with storage_path`);

  // Bucket covers by normalized title -> list of {year, issueNumberNorm}
  const coversByTitle = new Map();
  for (const r of ccRows) {
    const k = norm(r.series_title);
    if (!k) continue;
    if (!coversByTitle.has(k)) coversByTitle.set(k, []);
    coversByTitle.get(k).push({
      year: r.series_year ?? parseYear(r.cover_date),
      issueNum: norm(r.issue_number),
    });
  }

  console.log(`\nLoading gcd_issues per series (in batches)…`);
  const seriesGcdIds = targets.map((s) => s.gcd_id).filter(Boolean);

  // Bucket issue counts and issue_numbers per series
  const issuesBySeriesGcdId = new Map();
  for (let i = 0; i < seriesGcdIds.length; i += 200) {
    const batch = seriesGcdIds.slice(i, i + 200);
    const { data } = await supabase
      .from("gcd_issues")
      .select("series_gcd_id, issue_number, publication_date")
      .in("series_gcd_id", batch);
    for (const r of data ?? []) {
      const key = r.series_gcd_id;
      if (!issuesBySeriesGcdId.has(key)) issuesBySeriesGcdId.set(key, []);
      issuesBySeriesGcdId.get(key).push({
        issueNum: norm(r.issue_number),
        year: parseYear(r.publication_date),
      });
    }
    process.stdout.write(`  ${Math.min(i + 200, seriesGcdIds.length)}/${seriesGcdIds.length}\r`);
  }
  console.log(`  done loading issues for ${issuesBySeriesGcdId.size} series`);

  // For each series, compute coverage
  const ranked = [];
  for (const s of targets) {
    const issues = issuesBySeriesGcdId.get(s.gcd_id) ?? [];
    if (issues.length === 0) continue;

    const titleKey = norm(s.title);
    const candidates = coversByTitle.get(titleKey) ?? [];
    const yearStart = s.year_start_cached;
    const yearEnd = s.year_end_cached;

    // Pre-filter candidates whose series_year is within the series span
    const inSpan = candidates.filter((c) => {
      if (c.year == null) return true;
      if (yearStart != null && c.year < yearStart - YEAR_TOLERANCE) return false;
      if (yearEnd != null && c.year > yearEnd + YEAR_TOLERANCE) return false;
      return true;
    });

    const inSpanByIssue = new Set(inSpan.map((c) => c.issueNum));

    let covered = 0;
    for (const i of issues) {
      if (inSpanByIssue.has(i.issueNum)) covered += 1;
    }

    const total = issues.length;
    const uncovered = total - covered;
    const pct = total > 0 ? (covered / total) * 100 : 0;

    ranked.push({
      id: s.id,
      gcd_id: s.gcd_id,
      title: s.title,
      publisher: s.resolved_publisher_cached,
      year_start: yearStart,
      year_end: yearEnd,
      total,
      covered,
      uncovered,
      pct,
    });
  }

  // Sort: most uncovered issues first, then series with NO covers prioritized
  ranked.sort((a, b) => {
    if (a.covered === 0 && b.covered > 0) return -1;
    if (b.covered === 0 && a.covered > 0) return 1;
    return b.uncovered - a.uncovered;
  });

  const top = ranked.slice(0, TOP);

  console.log(`\n──────── Top ${TOP} series with worst cover gaps ────────`);
  console.log("# uncovered | total | covered | %    | publisher        | year      | title");
  console.log("─".repeat(110));
  for (const r of top) {
    const yr = r.year_start
      ? r.year_start === r.year_end
        ? `${r.year_start}`
        : `${r.year_start}–${r.year_end ?? "?"}`
      : "?";
    console.log(
      `${String(r.uncovered).padStart(8)} | ` +
      `${String(r.total).padStart(5)} | ` +
      `${String(r.covered).padStart(7)} | ` +
      `${r.pct.toFixed(0).padStart(3)}% | ` +
      `${(r.publisher ?? "—").padEnd(16).slice(0, 16)} | ` +
      `${yr.padEnd(9)} | ` +
      `${r.title}`
    );
  }

  // Emit Python-pasteable list
  console.log(`\n──────── Paste into TARGET_VOLUMES in comicvine_api_to_supabase.py ────────`);
  for (const r of top) {
    const pub = (r.publisher ?? "").replace(/"/g, '\\"');
    const name = (r.title ?? "").replace(/"/g, '\\"');
    const year = r.year_start ?? null;
    console.log(
      `  {"name": "${name}", "publisher": "${pub}", "year": ${year}},  # ${r.uncovered} of ${r.total} uncovered`
    );
  }

  // Emit JSON for --targets ingestion
  const jsonTargets = top.map((r) => ({
    name: r.title,
    publisher: r.publisher,
    year: r.year_start,
  }));
  fs.writeFileSync(OUT_FILE, JSON.stringify(jsonTargets, null, 2));
  console.log(`\nWrote ${jsonTargets.length} targets to ${OUT_FILE}`);
  console.log(`Run:  python comicvine_api_to_supabase.py --targets ${path.relative(path.resolve(__dirname, ".."), OUT_FILE)}`);

  // Summary
  const totalUncovered = ranked.reduce((s, r) => s + r.uncovered, 0);
  const totalIssues = ranked.reduce((s, r) => s + r.total, 0);
  console.log(`\nOverall: ${totalUncovered} of ${totalIssues} issues uncovered across ${ranked.length} ranked series (${((totalUncovered / Math.max(1, totalIssues)) * 100).toFixed(1)}%)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
