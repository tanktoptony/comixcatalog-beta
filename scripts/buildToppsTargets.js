// buildToppsTargets.js — emit gap-topps.json with explicit ComicVine volume_ids
// for every Topps Comics series in our `series` table that lacks a cover.
//
// Why: the python ingest script costs a ComicVine search call per target when
// it has to disambiguate by name+year. When we ALREADY know the CV volume_id
// (via the publisher's volume list), the script can fetch the volume directly
// — zero search budget consumed, just one volume + issues call per target.
//
// What it does:
//   1. Paginate CV API /volumes/ filtered by publisher:519 (Topps Comics).
//   2. Read our `series` rows where resolved_publisher_cached = "Topps Comics"
//      AND featured_cover_path_cached IS NULL (i.e., still need covers).
//   3. Cross-match by (normalized_title, start_year +/- 1).
//   4. Write gap-topps.json: [{name, publisher, year, volume_id}, ...]
//   5. Report unmatched series so we know what slipped through.
//
// Usage:
//   node scripts/buildToppsTargets.js
//   → writes gap-topps.json
//   → run: python comicvine_api_to_supabase.py --targets gap-topps.json --skip-existing

import dotenv from "dotenv";
import path from "path";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

import { createClient } from "@supabase/supabase-js";

const CV_KEY = process.env.COMICVINE_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CV_KEY) { console.error("COMICVINE_API_KEY missing in .env.local"); process.exit(1); }

const TOPPS_PUBLISHER_ID = 519; // ComicVine publisher id for Topps Comics
const CV_HEADERS = { "User-Agent": "ComixCatalog/1.0 (cover ingest helper)" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normTitle(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchToppsVolumesFromCV() {
  const all = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const params = new URLSearchParams({
      api_key: CV_KEY,
      format: "json",
      filter: `publisher:${TOPPS_PUBLISHER_ID}`,
      field_list: "id,name,start_year,count_of_issues",
      limit: String(limit),
      offset: String(offset),
    });
    const url = `https://comicvine.gamespot.com/api/volumes/?${params}`;
    console.log(`  CV fetch offset=${offset}…`);
    const res = await fetch(url, { headers: CV_HEADERS });
    if (!res.ok) {
      console.error(`  CV API returned ${res.status}: ${await res.text()}`);
      break;
    }
    const json = await res.json();
    if (json.error && json.error !== "OK") {
      console.error(`  CV API error: ${json.error}`);
      break;
    }
    const results = json.results ?? [];
    all.push(...results);
    const total = json.number_of_total_results ?? 0;
    const got = offset + results.length;
    if (got >= total || results.length === 0) break;
    offset += limit;
    await sleep(1500); // polite spacing — CV rate limit is ~1 req/sec
  }
  return all;
}

async function run() {
  console.log("1. Fetching all Topps volumes from ComicVine API…");
  const cvVolumes = await fetchToppsVolumesFromCV();
  console.log(`   Got ${cvVolumes.length} volumes from CV.`);

  // Index by normalized name. Same name can exist for multiple years (e.g.
  // multiple Jurassic Park volumes), so the value is a list of {id, start_year}.
  const cvByName = new Map();
  for (const v of cvVolumes) {
    const key = normTitle(v.name);
    if (!cvByName.has(key)) cvByName.set(key, []);
    cvByName.get(key).push({
      id: v.id,
      start_year: v.start_year ? Number(v.start_year) : null,
      issue_count: v.count_of_issues ?? 0,
      raw_name: v.name,
    });
  }

  console.log("\n2. Reading our Topps Comics series that lack a cover…");
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: rows, error } = await sb
    .from("series")
    .select("gcd_id, title, year_start_cached, issue_count_cached, featured_cover_path_cached")
    .eq("resolved_publisher_cached", "Topps Comics")
    .is("featured_cover_path_cached", null)
    .gt("issue_count_cached", 0);
  if (error) throw error;
  console.log(`   Got ${rows.length} Topps series needing covers.`);

  const targets = [];
  const unmatched = [];
  const ambiguous = [];

  for (const s of rows) {
    const key = normTitle(s.title);
    const candidates = cvByName.get(key) ?? [];
    if (candidates.length === 0) { unmatched.push(s); continue; }

    // Pick the candidate whose start_year is closest to our year_start_cached.
    // Tolerance of ±1 (publication-month sometimes flips year vs cover-date).
    let best = null;
    let bestDelta = Infinity;
    for (const c of candidates) {
      if (c.start_year == null) continue;
      const delta = Math.abs(c.start_year - (s.year_start_cached ?? 0));
      if (delta < bestDelta) { best = c; bestDelta = delta; }
    }
    if (!best || bestDelta > 1) {
      // No year-aligned match — record so we can spot-check
      ambiguous.push({ series: s, candidates });
      continue;
    }

    targets.push({
      name: s.title,
      publisher: "Topps Comics",
      year: s.year_start_cached,
      volume_id: best.id,
    });
  }

  const outPath = path.resolve(__dirname, "../gap-topps.json");
  writeFileSync(outPath, JSON.stringify(targets, null, 2));

  console.log(`\n══════ Result ══════`);
  console.log(`  matched (will be ingested): ${targets.length}`);
  console.log(`  no CV match by title:       ${unmatched.length}`);
  console.log(`  CV match but year mismatch: ${ambiguous.length}`);
  console.log(`\nWrote ${targets.length} targets → gap-topps.json`);

  if (unmatched.length) {
    console.log(`\n--- unmatched (no CV title match) ---`);
    for (const s of unmatched.slice(0, 20)) {
      console.log(`  gcd-${s.gcd_id}  ${s.year_start_cached}  ${s.issue_count_cached}i  ${s.title}`);
    }
    if (unmatched.length > 20) console.log(`  ... and ${unmatched.length - 20} more`);
  }
  if (ambiguous.length) {
    console.log(`\n--- ambiguous (year mismatch) ---`);
    for (const { series, candidates } of ambiguous.slice(0, 10)) {
      const cands = candidates.map((c) => `${c.start_year}/id=${c.id}`).join(" ");
      console.log(`  gcd-${series.gcd_id} (${series.year_start_cached}) ${series.title}  CV: ${cands}`);
    }
  }

  console.log(`\nNext step:`);
  console.log(`  python comicvine_api_to_supabase.py --targets gap-topps.json --skip-existing`);
}

run().catch((err) => { console.error(err); process.exit(1); });
