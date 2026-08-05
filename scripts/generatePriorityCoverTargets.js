// Builds gap-priority.json from the live launch-priority universe. Read-only
// except for that report/target file. Matching mirrors checkTargetSeriesCoverage.
import dotenv from "dotenv";
import path from "path";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "../src/lib/featuredSeries.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dir, "../.env.local") });
const args = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith("--")).map((x) => {
  const [k, v] = x.slice(2).split("="); return [k, v ?? true];
}));
const OUT = path.resolve(dir, "..", String(args.out ?? "gap-priority.json"));
const HIGH_VALUE = Number(args["high-value"] ?? 100);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAGE = 1000, CHUNK = 100, YEAR_TOLERANCE = 1;

const norm = (v) => String(v ?? "").trim().toLowerCase();
const normPub = (v) => norm(v)
  .replace(/\b(comics|entertainment|publishing|inc\.?|llc|ltd|company|co\.?)\b/g, "")
  .replace(/[^a-z0-9]+/g, "");
function year(v) { const m = String(v ?? "").match(/\b(18|19|20)\d{2}\b/); return m ? Number(m[0]) : null; }
async function all(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}
async function chunks(table, select, field, values) {
  const rows = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const part = values.slice(i, i + CHUNK);
    rows.push(...await all(() => sb.from(table).select(select).in(field, part)));
  }
  return rows;
}
function tag(map, id, source) {
  if (!id) return;
  id = Number(id);
  if (!map.has(id)) map.set(id, new Set());
  map.get(id).add(source);
}

async function prioritySources() {
  const sources = new Map();
  const library = await all(() => sb.from("user_collections")
    .select("id,status,gcd_issue_id,comic_id,market_value,auto_market_value").order("id"));
  const comicIds = [...new Set(library.map((x) => x.comic_id).filter(Boolean))];
  const comics = comicIds.length ? await chunks("comics", "id,gcd_id,series_id", "id", comicIds) : [];
  const issueIds = [...new Set([
    ...library.map((x) => x.gcd_issue_id).filter(Boolean).map(Number),
    ...comics.map((x) => x.gcd_id).filter(Boolean).map(Number),
  ])];
  const issues = issueIds.length ? await chunks("gcd_issues", "gcd_id,series_gcd_id", "gcd_id", issueIds) : [];
  const issueSeries = new Map(issues.map((x) => [Number(x.gcd_id), Number(x.series_gcd_id)]));
  const seriesUuids = [...new Set(comics.map((x) => x.series_id).filter(Boolean))];
  const localSeries = seriesUuids.length ? await chunks("series", "id,gcd_id", "id", seriesUuids) : [];
  const localSeriesMap = new Map(localSeries.map((x) => [x.id, Number(x.gcd_id)]));
  const comicMap = new Map(comics.map((x) => [x.id, x]));
  let unresolved = 0;
  for (const row of library) {
    let sid = row.gcd_issue_id ? issueSeries.get(Number(row.gcd_issue_id)) : null;
    if (!sid && row.comic_id) {
      const comic = comicMap.get(row.comic_id);
      sid = comic?.gcd_id ? issueSeries.get(Number(comic.gcd_id)) : localSeriesMap.get(comic?.series_id);
    }
    if (!sid) { unresolved += 1; continue; }
    tag(sources, sid, row.status === "wishlist" ? "wishlist" : "collection");
    if (Number(row.market_value) >= HIGH_VALUE || Number(row.auto_market_value) >= HIGH_VALUE) {
      tag(sources, sid, "high-value");
    }
  }
  const comps = await all(() => sb.from("market_comps").select("gcd_issue_id,sold_price")
    .not("gcd_issue_id", "is", null).gte("sold_price", HIGH_VALUE));
  const compIds = [...new Set(comps.map((x) => Number(x.gcd_issue_id)))];
  const compIssues = compIds.length ? await chunks("gcd_issues", "gcd_id,series_gcd_id", "gcd_id", compIds) : [];
  for (const issue of compIssues) tag(sources, issue.series_gcd_id, "high-value");

  const titles = [...new Set(FEATURED_SERIES.map((x) => x.title))];
  const pool = await chunks("series", "gcd_id,title,resolved_publisher_cached,year_start_cached", "title", titles);
  for (const entry of FEATURED_SERIES) {
    const candidates = pool.filter((x) => x.title === entry.title && normPub(x.resolved_publisher_cached) === normPub(entry.publisher));
    let best = candidates[0] ?? null;
    if (candidates.length > 1 && entry.prefer_year != null) {
      best = candidates.filter((x) => x.year_start_cached != null)
        .sort((a, b) => Math.abs(a.year_start_cached - entry.prefer_year) - Math.abs(b.year_start_cached - entry.prefer_year))[0] ?? null;
    }
    if (!best?.gcd_id) continue;
    tag(sources, best.gcd_id, "featured");
    if (entry.tier === 1) tag(sources, best.gcd_id, "current-heat");
  }
  return { sources, unresolved, libraryRows: library.length };
}

async function run() {
  const { sources, unresolved, libraryRows } = await prioritySources();
  const ids = [...sources.keys()];
  const series = await chunks("series", "gcd_id,title,resolved_publisher_cached,year_start_cached", "gcd_id", ids);
  const byId = new Map(series.map((x) => [Number(x.gcd_id), x]));
  const issues = await chunks("gcd_issues", "gcd_id,series_gcd_id,issue_number,publication_date", "series_gcd_id", ids);
  const covers = await chunks("canonical_covers", "series_title,issue_number,series_year,cover_date,publisher,storage_path", "series_title", [...new Set(series.map((x) => x.title))]);
  // ID-linked covers too: GCD and ComicVine frequently disagree on title
  // punctuation for the same series (e.g. GCD "G.I. Joe, a Real American
  // Hero" vs. the stored cover rows' "G.I. Joe: A Real American Hero") -
  // series_title-only matching silently missed those entirely even though
  // they're already correctly tagged with this series' own gcd_id. Mirrors
  // the ID-first pattern in /api/issues/[id] and /api/series/[id].
  const coversById = await chunks("canonical_covers", "series_gcd_id,issue_number,series_year,cover_date,publisher,storage_path", "series_gcd_id", ids);
  const issuesBySeries = new Map(), coversByTitle = new Map(), coversByIdMap = new Map();
  for (const x of issues) { const id = Number(x.series_gcd_id); if (!issuesBySeries.has(id)) issuesBySeries.set(id, []); issuesBySeries.get(id).push(x); }
  for (const x of covers) { if (!x.storage_path) continue; const t = norm(x.series_title); if (!coversByTitle.has(t)) coversByTitle.set(t, []); coversByTitle.get(t).push(x); }
  for (const x of coversById) { if (!x.storage_path) continue; const id = Number(x.series_gcd_id); if (!coversByIdMap.has(id)) coversByIdMap.set(id, []); coversByIdMap.get(id).push(x); }
  const targets = [];
  let total = 0, coveredTotal = 0;
  for (const id of ids) {
    const s = byId.get(id); if (!s) continue;
    const candidates = new Map(), pub = normPub(s.resolved_publisher_cached);
    // ID-linked covers are already unambiguously this volume via series_gcd_id
    // - no year-tolerance gate needed (that gate exists to disambiguate title
    // collisions across volumes, which an ID match has no risk of). Tracked
    // separately so a linked cover with no parseable year still counts.
    const idCoveredKeys = new Set();
    for (const c of coversByIdMap.get(id) ?? []) idCoveredKeys.add(norm(c.issue_number));
    for (const c of coversByTitle.get(norm(s.title)) ?? []) {
      if (pub && normPub(c.publisher) !== pub) continue;
      const key = norm(c.issue_number); if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key).push(c.series_year ?? year(c.cover_date));
    }
    const seriesIssues = issuesBySeries.get(id) ?? [];
    let covered = 0;
    for (const issue of seriesIssues) {
      const key = norm(issue.issue_number);
      if (idCoveredKeys.has(key)) { covered += 1; continue; }
      const years = candidates.get(key);
      const wanted = year(issue.publication_date) ?? s.year_start_cached ?? null;
      if (years?.length && (wanted == null || years.some((y) => y != null && Math.abs(y - wanted) <= YEAR_TOLERANCE))) covered += 1;
    }
    total += seriesIssues.length; coveredTotal += covered;
    if (covered < seriesIssues.length) targets.push({
      name: s.title, publisher: s.resolved_publisher_cached, year: s.year_start_cached,
      sources: [...sources.get(id)].sort(), missing: seriesIssues.length - covered, total: seriesIssues.length,
    });
  }
  const rank = { wishlist: 0, "current-heat": 1, collection: 2, "high-value": 3, featured: 4 };
  targets.sort((a, b) => Math.min(...a.sources.map((x) => rank[x] ?? 99)) - Math.min(...b.sources.map((x) => rank[x] ?? 99)) || b.missing - a.missing || a.name.localeCompare(b.name));
  writeFileSync(OUT, JSON.stringify(targets.map(({ sources, missing, total, ...x }) => x), null, 2) + "\n");
  console.log(`Priority series: ${ids.length}`);
  console.log(`Coverage: ${coveredTotal}/${total} (${(100 * coveredTotal / total).toFixed(2)}%)`);
  console.log(`Series still needing work: ${targets.length}`);
  console.log(`Unresolved library rows excluded: ${unresolved}/${libraryRows}`);
  console.log(`Wrote ${targets.length} targets -> ${OUT}`);
  console.log("\nTop 20 repair targets:");
  for (const x of targets.slice(0, 20)) console.log(`  ${String(x.missing).padStart(4)}/${String(x.total).padEnd(4)} ${x.name} (${x.year ?? "?"}) [${x.sources.join(", ")}]`);
}
run().catch((error) => { console.error(error); process.exit(1); });
