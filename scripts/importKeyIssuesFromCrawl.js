// Turn the ComicVine characters crawl into key_issues rows ("1st appearance
// of X"), keyed by our GCD issue ids.
//
// Usage (dry-run is the default; nothing is written without --apply):
//   node scripts/importKeyIssuesFromCrawl.js --crawl=../tmp/cv-characters/characters.jsonl
//   node scripts/importKeyIssuesFromCrawl.js --crawl=... --min=50 --apply
//
// How a character becomes a key:
//   1. The crawl gives each character's appearance count and ComicVine
//      first-appearance issue id. Characters under --min appearances, real
//      people and public-domain figures are dropped (scripts/lib/keyIssuesFromCrawl.js).
//   2. canonical_covers maps ComicVine issue ids (external_issue_id) to our
//      gcd_issue_id. Issues we have no linked cover for are skipped; they are
//      reported so they can be fed to cover ingest later.
//   3. The ComicVine issue number must equal our GCD issue number, so a
//      mislinked cover can't put a "1st appearance" on the wrong book.
//   4. Issues already in key_issues (the hand-curated seed) are left alone.
//   Tier 1 = top character has 1000+ appearances; everything else tier 2.
//
// Reads are keyset/chunked and check every error (PostgREST caps responses
// at 1000 rows silently). Inserts go in batches of 500 with a pause.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { buildKeyRows, firstAppearancesByCvIssue, normalizeIssueNumber } from "./lib/keyIssuesFromCrawl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.ENV_FILE ?? path.resolve(__dirname, "../.env.local") });

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
  const [key, value] = a.slice(2).split("=");
  return [key, value ?? true];
}));
const APPLY = Boolean(args.apply);
const crawlPath = args.crawl;
const MIN = Number(args.min ?? 50);
const PAGE = 1000;
const IN_CHUNK = 300;
const BATCH = 500;
const PAUSE_MS = 300;

if (!crawlPath) throw new Error("Provide --crawl=/path/to/characters.jsonl");
if (!Number.isFinite(MIN) || MIN < 1) throw new Error("--min must be a positive number");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readCrawl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

// ComicVine issue id -> gcd_issue_id, from canonical_covers (keyset by id).
// Two bridges:
//   direct     the cover row already carries gcd_issue_id
//   by series  the row has series_gcd_id + issue_number but no gcd_issue_id;
//              we find the GCD issue with that number in that series whose
//              year is within one of the cover date (the same rule the cover
//              resolver uses). Ambiguous matches are dropped.
async function cvToGcdMap(wanted) {
  const map = new Map();
  const viaSeries = new Map(); // cv id -> { series_gcd_id, issue_number, year }
  let lastId = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("canonical_covers")
      .select("id, external_issue_id, gcd_issue_id, series_gcd_id, issue_number, cover_date")
      .eq("source", "comicvine")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(`canonical_covers read failed: ${error.message}`);
    for (const row of data ?? []) {
      const cv = Number(row.external_issue_id);
      if (!wanted.has(cv) || map.has(cv)) continue;
      if (row.gcd_issue_id != null) {
        map.set(cv, Number(row.gcd_issue_id));
        viaSeries.delete(cv);
      } else if (row.series_gcd_id != null && !viaSeries.has(cv)) {
        viaSeries.set(cv, { series_gcd_id: Number(row.series_gcd_id), issue_number: normalizeIssueNumber(row.issue_number), year: yearOf(row.cover_date) });
      }
    }
    if (!data || data.length < PAGE) break;
    lastId = data[data.length - 1].id;
  }
  const direct = map.size;

  const seriesIds = [...new Set([...viaSeries.values()].map((v) => v.series_gcd_id))];
  const bySeriesNumber = new Map(); // "series|number" -> [{ gcd_id, year }]
  for (let i = 0; i < seriesIds.length; i += 50) {
    const chunk = seriesIds.slice(i, i + 50);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, key_date, publication_date")
        .in("series_gcd_id", chunk)
        .order("gcd_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`gcd_issues by series read failed: ${error.message}`);
      for (const r of data ?? []) {
        const key = `${r.series_gcd_id}|${normalizeIssueNumber(r.issue_number)}`;
        if (!bySeriesNumber.has(key)) bySeriesNumber.set(key, []);
        bySeriesNumber.get(key).push({ gcd_id: Number(r.gcd_id), year: yearOf(r.key_date) ?? yearOf(r.publication_date) });
      }
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }
  let bySeries = 0;
  for (const [cv, v] of viaSeries) {
    const hits = (bySeriesNumber.get(`${v.series_gcd_id}|${v.issue_number}`) ?? [])
      .filter((h) => v.year == null || h.year == null || Math.abs(h.year - v.year) <= 1);
    if (hits.length === 1) {
      map.set(cv, hits[0].gcd_id);
      bySeries += 1;
    }
  }
  console.log(`linked directly: ${direct}, linked by series + issue number + year: ${bySeries}`);
  return map;
}

async function readIn(table, columns, column, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase.from(table).select(columns).in(column, chunk).limit(PAGE * 10);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

async function existingKeyIds() {
  const ids = new Set();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from("key_issues").select("gcd_issue_id").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`key_issues read failed: ${error.message}`);
    for (const row of data ?? []) if (row.gcd_issue_id != null) ids.add(Number(row.gcd_issue_id));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

const yearOf = (v) => {
  const m = String(v ?? "").match(/\b(\d{4})\b/);
  return m ? Number(m[1]) : null;
};

async function main() {
  const byCvIssue = firstAppearancesByCvIssue(readCrawl(crawlPath), { minAppearances: MIN });
  console.log(`candidate first-appearance issues (min ${MIN} appearances): ${byCvIssue.size}`);

  const gcdIdByCvIssue = await cvToGcdMap(new Set(byCvIssue.keys()));
  console.log(`linked to a GCD issue through canonical_covers: ${gcdIdByCvIssue.size}`);

  const gcdIds = [...new Set(gcdIdByCvIssue.values())];
  const issues = await readIn("gcd_issues", "gcd_id, series_gcd_id, issue_number, publication_date, key_date", "gcd_id", gcdIds);
  const seriesIds = [...new Set(issues.map((i) => i.series_gcd_id).filter((v) => v != null))];
  const series = await readIn("series", "gcd_id, title, resolved_publisher_cached", "gcd_id", seriesIds);
  const seriesById = new Map(series.map((s) => [Number(s.gcd_id), s]));
  const issueByGcdId = new Map(issues.map((i) => {
    const s = seriesById.get(Number(i.series_gcd_id));
    return [Number(i.gcd_id), {
      issue_number: i.issue_number,
      title: s?.title ?? null,
      publisher: s?.resolved_publisher_cached && !/^unknown/i.test(s.resolved_publisher_cached) ? s.resolved_publisher_cached : null,
      year: yearOf(i.key_date) ?? yearOf(i.publication_date),
    }];
  }));

  const existing = await existingKeyIds();
  const { rows, skipped } = buildKeyRows({ byCvIssue, gcdIdByCvIssue, issueByGcdId, existingGcdIds: existing });
  const tiers = rows.reduce((acc, r) => ((acc[r.tier] = (acc[r.tier] ?? 0) + 1), acc), {});
  console.log("skipped:", skipped);
  console.log(`rows to insert: ${rows.length}`, tiers, `(existing key_issues: ${existing.size})`);
  console.log("tier 1 sample:");
  for (const r of rows.filter((r) => r.tier === 1).slice(0, 15)) console.log(`  ${r.title} #${r.issue_number} (${r.year}) ${r.reason}`);
  console.log("tier 2 sample:");
  for (const r of rows.filter((r) => r.tier === 2).sort(() => 0.5 - Math.random()).slice(0, 15)) console.log(`  ${r.title} #${r.issue_number} (${r.year}) ${r.reason}`);

  if (args.out) fs.writeFileSync(args.out, JSON.stringify(rows, null, 1));
  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to insert.");
    return;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from("key_issues").insert(rows.slice(i, i + BATCH));
    if (error) throw new Error(`insert failed at row ${i}: ${error.message}`);
    inserted += Math.min(BATCH, rows.length - i);
    await sleep(PAUSE_MS);
  }
  console.log(`inserted ${inserted} key_issues rows`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
