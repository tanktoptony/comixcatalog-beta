// Dry-run the catalog-link candidate finder. Reproduces the GET endpoint's
// matching logic and prints a summary + per-row breakdown.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";
const userId = process.argv[2] || ADMIN_ID;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

import { normTitle, normIssue, parseYear, bestYearFor, titleVariants, pickFromMatches } from "../src/lib/catalogLinkMatcher.js";


async function main() {
  console.log(`\nAuditing user_id = ${userId}\n`);

  const { data: localRows } = await supabase
    .from("user_collections")
    .select("id, comic_id")
    .eq("user_id", userId)
    .eq("status", "owned")
    .is("gcd_issue_id", null)
    .not("comic_id", "is", null);

  if (!localRows?.length) {
    console.log("No local-only owned rows. Nothing to link.\n");
    return;
  }

  const comicIds = [...new Set(localRows.map((r) => r.comic_id))];
  const { data: comics } = await supabase
    .from("comics")
    .select("id, series_title, issue_number, publisher, release_year")
    .in("id", comicIds);
  const comicById = Object.fromEntries((comics ?? []).map((c) => [c.id, c]));

  const titleNormSet = new Set();
  const variantsByComicId = new Map();
  for (const c of comics) {
    const vs = titleVariants(c.series_title);
    variantsByComicId.set(c.id, vs);
    for (const v of vs) titleNormSet.add(v);
  }
  const titleNorms = [...titleNormSet];
  const { data: seriesRows } = await supabase
    .from("series")
    .select("id, gcd_id, title, title_normalized, year_start_cached, year_end_cached, resolved_publisher_cached")
    .in("title_normalized", titleNorms)
    .not("gcd_id", "is", null);

  const seriesByNormTitle = new Map();
  for (const s of seriesRows ?? []) {
    if (!seriesByNormTitle.has(s.title_normalized)) seriesByNormTitle.set(s.title_normalized, []);
    seriesByNormTitle.get(s.title_normalized).push(s);
  }

  const allSeriesGcdIds = [];
  for (const arr of seriesByNormTitle.values()) for (const s of arr) allSeriesGcdIds.push(s.gcd_id);

  const issuesBySeriesIssue = new Map();
  if (allSeriesGcdIds.length) {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
        .in("series_gcd_id", allSeriesGcdIds)
        .range(from, from + PAGE - 1);
      if (!page?.length) break;
      for (const i of page) {
        const k = `${i.series_gcd_id}::${normIssue(i.issue_number)}`;
        if (!issuesBySeriesIssue.has(k)) issuesBySeriesIssue.set(k, []);
        issuesBySeriesIssue.get(k).push(i);
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }

  const confident = [];
  const ambiguous = [];
  const noMatch = [];

  for (const row of localRows) {
    const comic = comicById[row.comic_id];
    if (!comic) { noMatch.push({ comic: null }); continue; }
    const variants = variantsByComicId.get(comic.id) ?? [];
    const iNorm = normIssue(comic.issue_number);
    const seenSeries = new Set();
    const seriesCandidates = [];
    for (const v of variants) {
      for (const s of (seriesByNormTitle.get(v) ?? [])) {
        if (seenSeries.has(s.gcd_id)) continue;
        seenSeries.add(s.gcd_id);
        seriesCandidates.push(s);
      }
    }
    const matches = [];
    for (const s of seriesCandidates) {
      const issues = issuesBySeriesIssue.get(`${s.gcd_id}::${iNorm}`) ?? [];
      for (const i of issues) matches.push({
        gcd_issue_id: Number(i.gcd_id),
        series_gcd_id: s.gcd_id,
        series_title: s.title,
        issue_number: i.issue_number,
        series_year_start: s.year_start_cached,
        issue_year: bestYearFor(i),
      });
    }
    const result = pickFromMatches(matches, comic);
    if (result.status === "no_match") noMatch.push({ comic });
    else if (result.status === "confident") {
      confident.push({
        comic,
        candidate: result.picked,
        year_disambiguated: !!result.year_disambiguated,
        basePicked: !!result.base_picked,
      });
    } else ambiguous.push({ comic, candidates: matches });
  }

  console.log(`Local-only owned rows: ${localRows.length}\n`);
  console.log(`  ✓ Confident matches : ${confident.length}`);
  console.log(`  ? Ambiguous matches : ${ambiguous.length}`);
  console.log(`  ✗ No match found    : ${noMatch.length}\n`);

  if (confident.length) {
    console.log("══════ CONFIDENT (would link in bulk) ══════");
    for (const e of confident) {
      const tags = [];
      if (e.year_disambiguated) tags.push("year-picked");
      if (e.basePicked) tags.push("base-of-variants");
      const tag = tags.length ? ` [${tags.join(", ")}]` : "";
      console.log(`  ${e.comic.series_title} #${e.comic.issue_number} (${e.comic.release_year ?? "?"})  →  gcd-${e.candidate.gcd_issue_id} (${e.candidate.series_year_start ?? "?"})${tag}`);
    }
    console.log();
  }

  if (ambiguous.length) {
    console.log("══════ AMBIGUOUS (manual pick required) ══════");
    for (const e of ambiguous) {
      console.log(`  ${e.comic.series_title} #${e.comic.issue_number} (${e.comic.release_year ?? "?"}) — ${e.candidates.length} candidates:`);
      for (const c of e.candidates.slice(0, 5)) {
        console.log(`      gcd-${c.gcd_issue_id} from ${c.series_title} (${c.series_year_start ?? "?"})`);
      }
    }
    console.log();
  }

  if (noMatch.length) {
    console.log("══════ NO MATCH ══════");
    for (const e of noMatch) {
      if (!e.comic) { console.log("  (orphan row, no comic)"); continue; }
      console.log(`  ${e.comic.series_title} #${e.comic.issue_number} (${e.comic.release_year ?? "?"})`);
    }
    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
