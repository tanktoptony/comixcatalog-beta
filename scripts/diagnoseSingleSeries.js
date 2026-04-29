// One-off diagnostic for "this series row is rendering wrong on /search".
// Dumps the series row + its related GCD metadata so we can tell whether
// the bad value lives in:
//   (a) `series` table cached columns (year_start_cached etc.)
//   (b) the underlying gcd_series row
//   (c) the gcd_issues distribution (e.g. issue years are scattered)
//
// Usage:
//   node scripts/diagnoseSingleSeries.js --id <series_uuid>
//   node scripts/diagnoseSingleSeries.js "Superman" 2023
//   node scripts/diagnoseSingleSeries.js "The Transformers"

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

const args = process.argv.slice(2);
const idIdx = args.indexOf("--id");
const targetId = idIdx >= 0 ? args[idIdx + 1] : null;
const titleArg = idIdx >= 0 ? null : args[0];
const yearArg = idIdx >= 0 ? null : args[1] ? Number(args[1]) : null;

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

async function fetchSeries() {
  if (targetId) {
    const { data, error } = await supabase
      .from("series")
      .select(
        "id, gcd_id, title, title_normalized, year_start_cached, year_end_cached, issue_count_cached, resolved_publisher_cached, featured_cover_path_cached, cv_publisher, publisher_id"
      )
      .eq("id", targetId)
      .single();
    if (error) throw error;
    return [data];
  }

  let q = supabase
    .from("series")
    .select(
      "id, gcd_id, title, title_normalized, year_start_cached, year_end_cached, issue_count_cached, resolved_publisher_cached, featured_cover_path_cached, cv_publisher, publisher_id"
    )
    .ilike("title", titleArg)
    .not("gcd_id", "is", null)
    .limit(20);

  if (yearArg != null) q = q.eq("year_start_cached", yearArg);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function run() {
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  const rows = await fetchSeries();
  if (rows.length === 0) {
    console.log("No matching series row found.");
    return;
  }

  console.log(`\nFound ${rows.length} matching series row(s).`);

  for (const s of rows) {
    console.log("\n────────────────────────────────────────");
    console.log(`series.id          ${s.id}`);
    console.log(`title              ${JSON.stringify(s.title)}`);
    console.log(`title_normalized   ${JSON.stringify(s.title_normalized)}`);
    console.log(`gcd_id             ${s.gcd_id}`);
    console.log(`publisher_id       ${s.publisher_id}`);
    console.log(`cv_publisher       ${JSON.stringify(s.cv_publisher)}`);
    console.log(`resolved_publisher ${JSON.stringify(s.resolved_publisher_cached)}`);
    console.log(`year_start_cached  ${s.year_start_cached}`);
    console.log(`year_end_cached    ${s.year_end_cached}`);
    console.log(`issue_count_cached ${s.issue_count_cached}`);
    console.log(`featured_cover     ${s.featured_cover_path_cached ?? "(null)"}`);

    // Pull the gcd_series mirror
    const { data: gcdSeries } = await supabase
      .from("gcd_series")
      .select("gcd_id, name, sort_name, year_began, year_ended, publisher_gcd_id")
      .eq("gcd_id", s.gcd_id)
      .single();

    console.log("\n  gcd_series row:");
    if (gcdSeries) {
      console.log(`    name              ${JSON.stringify(gcdSeries.name)}`);
      console.log(`    sort_name         ${JSON.stringify(gcdSeries.sort_name)}`);
      console.log(`    year_began        ${gcdSeries.year_began}`);
      console.log(`    year_ended        ${gcdSeries.year_ended}`);
      console.log(`    publisher_gcd_id  ${gcdSeries.publisher_gcd_id}`);

      if (gcdSeries.publisher_gcd_id) {
        const { data: pub } = await supabase
          .from("gcd_publishers")
          .select("name")
          .eq("gcd_id", gcdSeries.publisher_gcd_id)
          .single();
        console.log(`    publisher.name    ${JSON.stringify(pub?.name ?? null)}`);
      }
    } else {
      console.log("    (not found)");
    }

    // Sample issue distribution to detect multi-volume conflation
    const { data: issues } = await supabase
      .from("gcd_issues")
      .select("issue_number, publication_date")
      .eq("series_gcd_id", s.gcd_id)
      .limit(500);

    const years = (issues ?? [])
      .map((i) => parseYear(i.publication_date))
      .filter((y) => y != null);

    if (years.length > 0) {
      years.sort((a, b) => a - b);
      const min = years[0];
      const max = years[years.length - 1];
      const mid = years[Math.floor(years.length / 2)];
      const distinctYears = new Set(years).size;
      console.log("\n  gcd_issues distribution:");
      console.log(`    total issues       ${issues.length}`);
      console.log(`    issues w/ year     ${years.length}`);
      console.log(`    distinct years     ${distinctYears}`);
      console.log(`    earliest pub year  ${min}`);
      console.log(`    median pub year    ${mid}`);
      console.log(`    latest pub year    ${max}`);

      // Flag the smell: if year_start_cached is way off the actual earliest
      // year, or if distinct years span > issue_count, we likely have
      // multi-volume conflation or bad cache.
      if (s.year_start_cached != null && Math.abs(s.year_start_cached - min) > 2) {
        console.log(
          `    ⚠ year_start_cached (${s.year_start_cached}) doesn't match earliest issue year (${min})`
        );
      }
      if (max - min > 30 && distinctYears > 30) {
        console.log(
          `    ⚠ issues span ${max - min} years — possible multi-volume conflation under one gcd_id`
        );
      }
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
