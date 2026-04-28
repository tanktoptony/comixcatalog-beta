// One-off diagnostic for "why is the cover not rendering for issue X". Walks
// the same path the API does (gcd_issues → series → canonical_covers) and
// reports exactly where the lookup fails.
//
// Usage:
//   node scripts/diagnoseSingleCover.js "X-Men Annual" 3
//   node scripts/diagnoseSingleCover.js "Witchblade" 68
//   node scripts/diagnoseSingleCover.js --gcd 12345

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

const args = process.argv.slice(2);
const gcdFlag = args.indexOf("--gcd");
const targetGcdId = gcdFlag >= 0 ? Number(args[gcdFlag + 1]) : null;

const titleArg = gcdFlag >= 0 ? null : args[0];
const issueArg = gcdFlag >= 0 ? null : args[1];

async function run() {
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  // 1. Find the gcd_issues row
  let gcdIssue = null;
  if (targetGcdId != null) {
    const { data } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number, title, publication_date")
      .eq("gcd_id", targetGcdId)
      .single();
    gcdIssue = data;
  } else {
    // Look up by title + issue
    const { data: seriesRows } = await supabase
      .from("series")
      .select("gcd_id, title")
      .ilike("title", titleArg)
      .not("gcd_id", "is", null)
      .limit(20);

    if (!seriesRows || seriesRows.length === 0) {
      console.log(`No series row matches title ILIKE "${titleArg}"`);
      return;
    }

    console.log(`\nMatching series rows (${seriesRows.length}):`);
    for (const s of seriesRows) {
      console.log(`  gcd_id=${s.gcd_id}  title=${JSON.stringify(s.title)}`);
    }

    const seriesGcdIds = seriesRows.map((r) => r.gcd_id);
    const { data: issueCandidates } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number, title, publication_date")
      .in("series_gcd_id", seriesGcdIds)
      .eq("issue_number", String(issueArg));

    if (!issueCandidates || issueCandidates.length === 0) {
      console.log(`\nNo gcd_issues row with issue_number=${issueArg} for those series`);
      return;
    }

    console.log(`\nMatching gcd_issues rows (${issueCandidates.length}):`);
    for (const i of issueCandidates) {
      console.log(`  gcd_id=${i.gcd_id}  series_gcd_id=${i.series_gcd_id}  issue=${i.issue_number}  pub=${i.publication_date}`);
    }
    gcdIssue = issueCandidates[0];
    console.log(`\nUsing first match: gcd_id=${gcdIssue.gcd_id}`);
  }

  if (!gcdIssue) {
    console.log("Could not resolve a gcd_issues row.");
    return;
  }

  console.log("\n──────── gcd_issues row ────────");
  console.log(gcdIssue);

  // 2. Resolve series.title for this issue
  const { data: seriesRow } = await supabase
    .from("series")
    .select("id, gcd_id, title, year_start_cached, year_end_cached")
    .eq("gcd_id", gcdIssue.series_gcd_id)
    .single();

  console.log("\n──────── series row ────────");
  console.log(seriesRow);

  if (!seriesRow?.title) {
    console.log("\nNo series title — cover lookup would skip this row entirely.");
    return;
  }

  // 3. Look up canonical_covers (exactly what the API does)
  const issueYear = parseYear(gcdIssue.publication_date);
  console.log(`\nIssue year (parsed from publication_date): ${issueYear ?? "null"}`);

  const { data: covers, error } = await supabase
    .from("canonical_covers")
    .select("series_title, issue_number, series_year, cover_date, storage_path, publisher")
    .eq("series_title", seriesRow.title)
    .eq("issue_number", gcdIssue.issue_number);

  if (error) {
    console.log("canonical_covers lookup error:", error);
    return;
  }

  console.log(`\n──────── canonical_covers matches (${covers?.length ?? 0}) ────────`);
  for (const c of covers ?? []) {
    const cy = parseYear(c.cover_date);
    const sy = c.series_year != null ? Number(c.series_year) : null;
    const yearOf = cy ?? sy;
    const diff = issueYear != null && yearOf != null ? Math.abs(yearOf - issueYear) : null;
    console.log(
      `  series_year=${c.series_year ?? "null"}  cover_date=${c.cover_date ?? "null"}  parsed=${yearOf ?? "null"}  diff_to_issue=${diff ?? "n/a"}  path=${c.storage_path ?? "null"}`
    );
  }

  if (!covers || covers.length === 0) {
    console.log("\n→ No canonical_covers row exists for this (series_title, issue_number) pair.");
    console.log("  This is a data-ingestion gap. The cover doesn't live in canonical_covers,");
    console.log("  so no query change can surface it. Need to run comicvine_api_to_supabase.py");
    console.log("  with this volume in the target list.");
    return;
  }

  // 4. Show what the API would do
  console.log("\n──────── What the API would pick ────────");
  const COVER_YEAR_TOLERANCE = 1;
  if (issueYear == null) {
    console.log("Issue has no parseable publication year — API would skip year-filter and pick first storage_path.");
  } else {
    let best = null;
    let bestDiff = Infinity;
    for (const c of covers) {
      const cy = parseYear(c.cover_date) ?? (c.series_year != null ? Number(c.series_year) : null);
      if (cy == null) continue;
      const diff = Math.abs(cy - issueYear);
      if (diff > COVER_YEAR_TOLERANCE) continue;
      if (diff < bestDiff) {
        best = c;
        bestDiff = diff;
      }
    }
    if (best) {
      console.log(`Picked: ${best.storage_path} (year=${parseYear(best.cover_date) ?? best.series_year}, diff=${bestDiff})`);
    } else {
      console.log("No candidate within ±1 year of issue's publication year — API returns no cover.");
      console.log("Closest mismatch:");
      let closest = null;
      let closestDiff = Infinity;
      for (const c of covers) {
        const cy = parseYear(c.cover_date) ?? (c.series_year != null ? Number(c.series_year) : null);
        if (cy == null) continue;
        const diff = Math.abs(cy - issueYear);
        if (diff < closestDiff) {
          closest = c;
          closestDiff = diff;
        }
      }
      if (closest) {
        console.log(`  ${closest.storage_path}  off by ${closestDiff} years`);
        console.log(`  → If you want this to surface, raise COVER_YEAR_TOLERANCE in the API.`);
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
