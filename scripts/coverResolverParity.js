#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolveCovers } from "../src/lib/catalog/covers.js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";

dotenv.config({ path: path.resolve(".env.local") });

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/coverResolverParity.js [--base=URL] [--seed=41] [--limit=N] [--break-tier=2]");
  process.exit(0);
}

const BASE = option("base", "https://www.comixcatalog.com").replace(/\/$/, "");
const SEED = Number(option("seed", "41"));
const LIMIT = option("limit", null) == null ? null : Number(option("limit", null));
const BREAK_TIER_2 = option("break-tier", "") === "2";

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function shuffle(values, random) {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

function chunks(values, size = 500) {
  const out = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

function proportionalSlice(cohorts, limit) {
  const total = cohorts.reduce((sum, cohort) => sum + cohort.rows.length, 0);
  if (limit == null || limit >= total) return cohorts;
  const target = Math.max(0, limit);
  const allocations = cohorts.map((cohort) => {
    const exact = total ? target * cohort.rows.length / total : 0;
    return { ...cohort, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = target - allocations.reduce((sum, cohort) => sum + cohort.count, 0);
  for (const cohort of [...allocations].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining <= 0) break;
    if (cohort.count < cohort.rows.length) {
      cohort.count += 1;
      remaining -= 1;
    }
  }
  return allocations.map((cohort) => ({ name: cohort.name, rows: cohort.rows.slice(0, cohort.count) }));
}

async function fetchChunked(values, build, order = "gcd_id") {
  const rows = [];
  for (const group of chunks(values)) rows.push(...await fetchAllPages(() => build(group), order));
  return rows;
}

// fetchAllPages intentionally guards individual scans at 50k rows. Keyset
// segments retain that safety while allowing this audit to inspect the full table.
async function fetchAllByKeyset(build, order = "id") {
  const rows = [];
  let cursor = null;
  while (true) {
    const page = await fetchAllPages(() => {
      let query = build();
      if (cursor != null) query = query.gt(order, cursor);
      return query.limit(50000);
    }, order);
    rows.push(...page);
    if (page.length < 50000) break;
    cursor = page.at(-1)[order];
  }
  return rows;
}

function storagePath(url) {
  if (!url) return null;
  const marker = "/canonical-covers/";
  const index = url.indexOf(marker);
  return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

async function oldCover(issueId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE}/api/issues/gcd-${issueId}`);
    if (response.status >= 500 && attempt < 2) continue;
    if (!response.ok) throw new Error(`old endpoint ${issueId}: HTTP ${response.status}`);
    return storagePath((await response.json()).issue?.cover);
  }
  return null;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const random = rng(SEED);

const coverLinks = await fetchAllByKeyset(() => supabase.from("canonical_covers")
  .select("id, gcd_issue_id, series_gcd_id").not("storage_path", "is", null));
const seriesCoverCounts = new Map();
const coveredIssueIds = new Set();
for (const row of coverLinks) {
  if (row.series_gcd_id != null) seriesCoverCounts.set(row.series_gcd_id, (seriesCoverCounts.get(row.series_gcd_id) ?? 0) + 1);
  if (row.gcd_issue_id != null) coveredIssueIds.add(row.gcd_issue_id);
}
const topSeriesIds = [...seriesCoverCounts].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id]) => id);

const allSeries = await fetchAllByKeyset(() => supabase.from("series")
  .select("id, gcd_id, title, year_start_cached, year_end_cached"));
const byTitle = new Map();
for (const row of allSeries) {
  if (!row.title) continue;
  const values = byTitle.get(row.title) ?? [];
  values.push(row);
  byTitle.set(row.title, values);
}
const clusterSeriesIds = shuffle([...byTitle.values()].filter((rows) => rows.length >= 3), random)
  .slice(0, 50).flatMap((rows) => rows.map((row) => row.gcd_id)).filter(Boolean);
const selected = new Map();
const addCohort = (name, rows) => {
  const unique = rows.filter((row) => !selected.has(row.gcd_id));
  unique.forEach((row) => selected.set(row.gcd_id, row));
  return { name, rows: unique };
};
// Ordered series_gcd_id, gcd_id: gcd_id alone under an IN(series_gcd_id)
// filter measured ~3s per page on production (see #212).
const topSeriesCohort = addCohort("top series", await fetchChunked(topSeriesIds, (group) => supabase.from("gcd_issues")
  .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("series_gcd_id", group)
  .order("series_gcd_id")));
const titleClusterCohort = addCohort("title clusters", await fetchChunked(clusterSeriesIds, (group) => supabase.from("gcd_issues")
  .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("series_gcd_id", group)
  .order("series_gcd_id")));

const randomCovered = shuffle([...coveredIssueIds].filter((id) => !selected.has(id)), random).slice(0, 2000);
const randomRows = [];
for (const group of chunks(randomCovered)) {
  randomRows.push(...await fetchAllPages(() => supabase.from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("gcd_id", group), "gcd_id"));
}
const randomCohort = addCohort("random", randomRows);

const cohorts = proportionalSlice([topSeriesCohort, titleClusterCohort, randomCohort], LIMIT);
const cohortCounts = Object.fromEntries(cohorts.map((cohort) => [cohort.name, cohort.rows.length]));
const sample = cohorts.flatMap((cohort) => cohort.rows);
const seriesByGcd = new Map(allSeries.filter((row) => row.gcd_id != null).map((row) => [String(row.gcd_id), row]));
const resolverIssues = sample.map((row) => {
  const series = seriesByGcd.get(String(row.series_gcd_id));
  const year = Number(String(row.key_date ?? row.publication_date ?? "").match(/\b(\d{4})\b/)?.[1]) || null;
  return {
    gcd_issue_id: row.gcd_id,
    series_gcd_id: row.series_gcd_id,
    series_title: series?.title ?? null,
    issue_number: row.issue_number,
    year,
    series_year_start: series?.year_start_cached ?? null,
    series_year_end: series?.year_end_cached ?? null,
  };
});
const newCovers = await resolveCovers(supabase, resolverIssues);
if (BREAK_TIER_2) {
  for (const [id, value] of newCovers) if (value.tier === 2) newCovers.delete(id);
}

const rows = [];
for (const issue of resolverIssues) {
  const oldPath = await oldCover(issue.gcd_issue_id);
  const resolved = newCovers.get(issue.gcd_issue_id);
  const newPath = resolved?.storage_path ?? null;
  const status = oldPath === newPath ? "same" : !oldPath && newPath ? "gained" : oldPath && !newPath ? "lost" : "changed";
  rows.push({ ...issue, oldPath, newPath, tier: resolved?.tier ?? "", status });
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const counts = Object.fromEntries(["same", "gained", "lost", "changed"].map((status) => [status, rows.filter((row) => row.status === status).length]));
const date = new Date().toISOString().slice(0, 10);
const report = [
  `# Cover resolver parity — ${date}`,
  "",
  `Sample: ${rows.length}; top series: ${cohortCounts["top series"]}; title clusters: ${cohortCounts["title clusters"]}; random: ${cohortCounts.random}; seed: ${SEED}; break tier 2: ${BREAK_TIER_2 ? "yes" : "no"}`,
  "",
  "| Same | Gained | Lost | Changed |",
  "|---:|---:|---:|---:|",
  `| ${counts.same} | ${counts.gained} | ${counts.lost} | ${counts.changed} |`,
  "",
  "| Result | Series | Year | Issue | GCD ID | Old path | New path | Tier |",
  "|---|---|---:|---|---:|---|---|---:|",
  ...rows.filter((row) => row.status !== "same").map((row) =>
    `| ${row.status} | ${row.series_title ?? ""} | ${row.year ?? ""} | ${row.issue_number ?? ""} | ${row.gcd_issue_id} | ${row.oldPath ?? ""} | ${row.newPath ?? ""} | ${row.tier} |`
  ),
  "",
].join("\n");
const output = path.resolve(`reports/cover-resolver-parity-${date}.md`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, report);
console.log(`Wrote ${output}`);
