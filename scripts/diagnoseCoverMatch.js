// Replicates the cache refresh's cover-matching pipeline for a single series
// to find where the join is silently failing.
//
// Usage:
//   node scripts/diagnoseCoverMatch.js --series-id=<uuid>
//   node scripts/diagnoseCoverMatch.js --title="The Amazing Spider-Man" --year=1999

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseYear(value) {
  if (!value) return null;
  const m = String(value).match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function bestYearFor(row) {
  return parseYear(row.publication_date) ?? parseYear(row.key_date);
}

async function run() {
  // 1. Find target series row
  let seriesQuery = supabase.from("series").select("id, title, gcd_id, year_start_cached, year_end_cached, issue_count_cached, resolved_publisher_cached, featured_cover_path_cached");
  if (args["series-id"]) {
    seriesQuery = seriesQuery.eq("id", args["series-id"]);
  } else if (args.title) {
    seriesQuery = seriesQuery.eq("title", args.title);
    if (args.year) seriesQuery = seriesQuery.eq("year_start_cached", Number(args.year));
  } else {
    console.error("Pass --series-id=<uuid> or --title=<title> --year=<yr>");
    process.exit(2);
  }

  const { data: seriesRows } = await seriesQuery;
  const series = seriesRows?.[0];
  if (!series) {
    console.error("No series row found.");
    process.exit(1);
  }

  console.log("══════ TARGET SERIES ══════");
  console.log(`  id:                    ${series.id}`);
  console.log(`  title:                 '${series.title}'`);
  console.log(`  gcd_id:                ${series.gcd_id}`);
  console.log(`  year_start_cached:     ${series.year_start_cached}`);
  console.log(`  year_end_cached:       ${series.year_end_cached}`);
  console.log(`  issue_count_cached:    ${series.issue_count_cached}`);
  console.log(`  featured_cover_path:   ${series.featured_cover_path_cached ?? '(NULL)'}`);

  if (!series.gcd_id) {
    console.log("\nNo gcd_id → cache refresh can't match issues for this series.");
    return;
  }

  // 2. Pull all gcd_issues for this series (the same way cache refresh does)
  // Note: paginates because Supabase caps at 1000.
  const issues = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("gcd_issues")
      .select("gcd_id, issue_number, publication_date, key_date")
      .eq("series_gcd_id", series.gcd_id)
      .order("gcd_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    issues.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`\n  gcd_issues count:      ${issues.length}`);

  const titleKey = String(series.title).trim().toLowerCase();
  const issueNumbers = new Set(issues.map((r) => String(r.issue_number ?? "").trim()).filter(Boolean));
  const issueYearByNumber = new Map();
  for (const r of issues) {
    const num = String(r.issue_number ?? "").trim();
    if (!num) continue;
    const y = bestYearFor(r);
    if (y != null) issueYearByNumber.set(num, y);
  }
  console.log(`  distinct issue numbers: ${issueNumbers.size}`);
  console.log(`  issues with year info:  ${issueYearByNumber.size}`);

  // 3. Pull canonical_covers for this title
  const { data: covers } = await supabase
    .from("canonical_covers")
    .select("series_title, issue_number, series_year, cover_date, publisher, storage_path, comicvine_volume_id")
    .ilike("series_title", series.title);

  console.log(`\n══════ CANONICAL_COVERS for title '${series.title}' ══════`);
  console.log(`  total rows: ${covers?.length ?? 0}`);

  if (!covers?.length) {
    console.log("  No covers at all for this title. Cache match would correctly produce null.");
    return;
  }

  // Bucket by storage_path presence
  const withPath = covers.filter((c) => c.storage_path);
  console.log(`  with storage_path: ${withPath.length}`);
  console.log(`  null storage_path: ${covers.length - withPath.length}`);

  // 4. Replicate per-issue matcher
  // Build coversByTitleAndIssue map for this title
  const coversByTitleAndIssue = new Map();
  for (const c of covers) {
    const num = String(c.issue_number ?? "").trim();
    const key = `${titleKey}::${num}`;
    if (!coversByTitleAndIssue.has(key)) coversByTitleAndIssue.set(key, []);
    coversByTitleAndIssue.get(key).push(c);
  }

  // Per-issue match attempt for each issue this series has
  const coverCandidates = [];
  const yearMatchedByIssue = new Map();
  let issuesWithAnyMatch = 0;
  let issuesWithYearMatch = 0;
  for (const num of issueNumbers) {
    const pool = coversByTitleAndIssue.get(`${titleKey}::${num}`) ?? [];
    if (pool.length === 0) continue;
    issuesWithAnyMatch += 1;

    const issueYear = issueYearByNumber.get(num);
    const yearMatched = issueYear != null
      ? pool.filter((r) => Number(r.series_year) === issueYear)
      : [];
    if (yearMatched.length > 0) issuesWithYearMatch += 1;
    yearMatchedByIssue.set(num, { poolSize: pool.length, yearMatched: yearMatched.length, issueYear });

    const chosen = yearMatched.length > 0 ? yearMatched : pool;
    for (const row of chosen) coverCandidates.push({ ...row, _issueYear: issueYear ?? null });
  }

  console.log(`\n══════ MATCH PIPELINE ══════`);
  console.log(`  issues with ANY cover match (by title+number):   ${issuesWithAnyMatch}/${issueNumbers.size}`);
  console.log(`  issues with EXACT year-matched cover:            ${issuesWithYearMatch}/${issueNumbers.size}`);
  console.log(`  total cover candidates after year filter:        ${coverCandidates.length}`);

  // Show 5 sample matched candidates
  if (coverCandidates.length > 0) {
    console.log("\n  Sample candidates (first 5):");
    for (const c of coverCandidates.slice(0, 5)) {
      console.log(`    issue=${c.issue_number}  vol=${c.comicvine_volume_id}  series_year=${c.series_year}  cover_date=${c.cover_date}  pub=${c.publisher}  path=${c.storage_path ? "YES" : "NULL"}`);
    }
  }

  // 5. Replicate scoreCover for each candidate
  const yearStart = series.year_start_cached;
  const yearEnd = series.year_end_cached;
  const COVER_SCORE_THRESHOLD = 200;

  console.log(`\n══════ SCORING (threshold ${COVER_SCORE_THRESHOLD}, year window ${yearStart}-${yearEnd}) ══════`);
  let bestScore = -Infinity;
  let bestCover = null;
  for (const c of coverCandidates) {
    if (!c.storage_path) continue;
    let score = 0;
    const coverYear = parseYear(c.cover_date);
    if (coverYear != null && yearStart != null && yearEnd != null) {
      if (coverYear >= yearStart && coverYear <= yearEnd) {
        score += 200;
        if (coverYear === yearStart) score += 40;
      } else {
        score -= Math.abs(coverYear - yearStart) * 10;
      }
    } else if (yearStart != null && coverYear == null) {
      score -= 500;
    }
    const issueStr = String(c.issue_number ?? "").trim();
    if (issueStr === "1" || issueStr === "#1") score += 50;
    if (score > bestScore) {
      bestScore = score;
      bestCover = c;
    }
  }
  console.log(`  best score: ${bestScore}`);
  console.log(`  best cover: ${bestCover ? `vol=${bestCover.comicvine_volume_id} issue=${bestCover.issue_number} year=${bestCover.series_year}` : "(none)"}`);
  console.log(`  passes threshold (${COVER_SCORE_THRESHOLD})? ${bestScore >= COVER_SCORE_THRESHOLD ? "YES" : "NO"}`);

  if (bestScore < COVER_SCORE_THRESHOLD) {
    console.log("\n  ✗ Cover would NOT be set by strict matcher. Tier-3 fallback would try anything with storage_path.");
  } else {
    console.log("\n  ✓ Cover SHOULD be set by strict matcher. If featured_cover_path_cached is NULL, something else is wrong.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
