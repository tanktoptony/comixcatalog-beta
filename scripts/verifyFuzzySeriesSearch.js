#!/usr/bin/env node
// Read-only production-data harness for migration 0038. It fetches every
// eligible series in UUID order, respecting PostgREST's 1000-row cap, then
// reproduces the SQL tiers locally. It never writes to Supabase.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";
import { scoreSeriesSearchTitle } from "../src/lib/seriesSearchMatch.js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const PAGE_SIZE = 1000;

async function fetchCandidates() {
  const rows = [];
  let after = null;
  while (true) {
    let query = supabase
      .from("series")
      .select("id,gcd_id,title,issue_count_cached,year_start_cached,resolved_publisher_cached,us_market")
      .not("gcd_id", "is", null)
      .gt("issue_count_cached", 0)
      .not("year_start_cached", "is", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error(`series page after ${after ?? "start"}: ${error.message}`);
    const page = data ?? [];
    rows.push(
      ...page.filter(
        (row) => row.us_market === true || US_PUBLISHER_ALLOWLIST.includes(row.resolved_publisher_cached)
      )
    );
    if (page.length < PAGE_SIZE) break;
    after = page.at(-1).id;
  }
  return rows;
}

const cases = [
  ["cerbus", /^Cerebus$/, 1977],
  ["street fighter ii animated", /^Street Fighter II: The Animated Movie Official$/, 1996],
  ["streetfighter", /Street Fighter/i, null],
  ["spiderman", /Spider-Man/i, null],
  ["absolute batman", /^Absolute Batman$/, 2024],
  ["x-o", /^X-O Manowar$/i, null],
];

const candidates = await fetchCandidates();
let failed = false;
for (const [query, titlePattern, year] of cases) {
  const ranked = candidates
    .map((row) => ({ ...row, score: scoreSeriesSearchTitle(row.title, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.issue_count_cached - a.issue_count_cached)
    .slice(0, 5);
  const top = ranked[0];
  const passed = Boolean(top && titlePattern.test(top.title) && (year == null || top.year_start_cached === year));
  failed ||= !passed;
  console.log(`${passed ? "PASS" : "FAIL"} ${JSON.stringify(query)} -> ${top?.title ?? "no result"} (${top?.year_start_cached ?? "?"})`);
  console.log(`  ${ranked.map((row) => `${row.title} (${row.year_start_cached})`).join(" | ")}`);
}
if (failed) process.exitCode = 1;
