#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { resolveCovers } from "../src/lib/catalog/covers.js";
import { fetchAllByKeyset, fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";

dotenv.config({ path: path.resolve(".env.local") });

function option(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/coverResolverParity.js [--base=URL] [--seed=41] [--sample-size=5500] [--limit=N] [--max-minutes=25] [--break-tier=2]");
  process.exit(0);
}

const BASE = option("base", "https://www.comixcatalog.com").replace(/\/$/, "");
const SEED = Number(option("seed", "41"));
const LIMIT = option("limit", null) == null ? null : Number(option("limit", null));
const SAMPLE_SIZE = Number(option("sample-size", "5500"));
const MAX_MINUTES = Number(option("max-minutes", "25"));
const BREAK_TIER_2 = option("break-tier", "") === "2";

if (!Number.isFinite(SEED)) throw new Error("--seed must be a number");
if (LIMIT != null && (!Number.isInteger(LIMIT) || LIMIT < 0)) throw new Error("--limit must be a non-negative integer");
if (!Number.isInteger(SAMPLE_SIZE) || SAMPLE_SIZE < 0) throw new Error("--sample-size must be a non-negative integer");
if (!Number.isFinite(MAX_MINUTES) || MAX_MINUTES < 0) throw new Error("--max-minutes must be a non-negative number");

const DEFAULT_CAPS = [2000, 1500, 2000];

function scaledCaps(total) {
  const baseTotal = DEFAULT_CAPS.reduce((sum, value) => sum + value, 0);
  const values = DEFAULT_CAPS.map((value, index) => {
    const exact = total * value / baseTotal;
    return { index, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = total - values.reduce((sum, value) => sum + value.count, 0);
  for (const value of [...values].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining <= 0) break;
    value.count += 1;
    remaining -= 1;
  }
  return values.sort((a, b) => a.index - b.index).map((value) => value.count);
}

const [TOP_SERIES_CAP, TITLE_CLUSTER_CAP, RANDOM_CAP] = scaledCaps(SAMPLE_SIZE);

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

function sampleEvenlyBySeries(rows, cap, random) {
  if (rows.length <= cap) return shuffle(rows, random);
  const bySeries = new Map();
  for (const row of rows) {
    const values = bySeries.get(String(row.series_gcd_id)) ?? [];
    values.push(row);
    bySeries.set(String(row.series_gcd_id), values);
  }
  const groups = shuffle([...bySeries.values()].map((values) => shuffle(values, random)), random);
  const sampled = [];
  for (let round = 0; sampled.length < cap; round += 1) {
    let added = false;
    for (const group of groups) {
      if (group[round] == null) continue;
      sampled.push(group[round]);
      added = true;
      if (sampled.length === cap) break;
    }
    if (!added) break;
  }
  return sampled;
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

function storagePath(url) {
  if (!url) return null;
  const marker = "/canonical-covers/";
  const index = url.indexOf(marker);
  return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

async function oldCover(issueId, waitForStart) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForStart();
    try {
      const response = await fetch(`${BASE}/api/issues/gcd-${issueId}`);
      if (response.status >= 500 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        continue;
      }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.retryable = response.status >= 500;
        throw error;
      }
      return storagePath((await response.json()).issue?.cover);
    } catch (error) {
      if (attempt >= 2 || error.retryable === false) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  return null;
}

async function loadCache(cachePath) {
  const cached = new Map();
  let contents;
  try {
    contents = await fs.readFile(cachePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return cached;
    throw error;
  }
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value.gcd_issue_id != null) cached.set(String(value.gcd_issue_id), value);
    } catch {
      console.warn(`Ignoring invalid cache line ${index + 1} in ${cachePath}`);
    }
  }
  return cached;
}

async function fetchOldCovers(issues, cachePath) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const cached = await loadCache(cachePath);
  const pending = issues.filter((issue) => !cached.has(String(issue.gcd_issue_id)));
  const previouslyFetched = issues.length - pending.length;
  const startedAt = Date.now();
  const deadline = startedAt + MAX_MINUTES * 60_000;
  let nextIndex = 0;
  let nextStartAt = startedAt;
  let fetchedThisRun = 0;
  let append = Promise.resolve();

  const waitForStart = async () => {
    const startAt = Math.max(Date.now(), nextStartAt);
    nextStartAt = startAt + 250;
    if (startAt >= deadline) {
      const error = new Error("time limit reached");
      error.code = "TIME_LIMIT";
      throw error;
    }
    const delay = startAt - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  };
  const record = async (value) => {
    cached.set(String(value.gcd_issue_id), value);
    append = append.then(() => fs.appendFile(cachePath, `${JSON.stringify(value)}\n`));
    await append;
    fetchedThisRun += 1;
    const completed = previouslyFetched + fetchedThisRun;
    if (fetchedThisRun % 250 === 0 || completed === issues.length) {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const rate = elapsedSeconds ? fetchedThisRun / elapsedSeconds : 0;
      console.log(`Progress: ${completed} of ${issues.length}; elapsed ${elapsedSeconds.toFixed(1)}s; ${rate.toFixed(2)} issues/s`);
    }
  };
  const worker = async () => {
    while (Date.now() < deadline) {
      const issue = pending[nextIndex];
      if (!issue) return;
      nextIndex += 1;
      let value;
      try {
        const oldPath = await oldCover(issue.gcd_issue_id, waitForStart);
        value = { gcd_issue_id: issue.gcd_issue_id, oldPath, error: null };
      } catch (error) {
        if (error.code === "TIME_LIMIT") return;
        value = { gcd_issue_id: issue.gcd_issue_id, oldPath: null, error: error instanceof Error ? error.message : String(error) };
      }
      await record(value);
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => worker()));
  await append;
  return cached;
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
const topSeriesRows = await fetchChunked(topSeriesIds, (group) => supabase.from("gcd_issues")
  .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("series_gcd_id", group)
  .order("series_gcd_id"));
const topSeriesCohort = addCohort("top series", sampleEvenlyBySeries(topSeriesRows, TOP_SERIES_CAP, random));
const titleClusterRows = await fetchChunked(clusterSeriesIds, (group) => supabase.from("gcd_issues")
  .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("series_gcd_id", group)
  .order("series_gcd_id"));
const titleClusterCandidates = titleClusterRows.filter((row) => !selected.has(row.gcd_id));
const titleClusterCohort = addCohort("title clusters", shuffle(titleClusterCandidates, random).slice(0, TITLE_CLUSTER_CAP));

const randomCovered = shuffle([...coveredIssueIds].filter((id) => !selected.has(id)), random).slice(0, RANDOM_CAP);
const randomRows = [];
for (const group of chunks(randomCovered)) {
  randomRows.push(...await fetchAllPages(() => supabase.from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("gcd_id", group), "gcd_id"));
}
const randomCohort = addCohort("random", randomRows);

const cohorts = proportionalSlice([topSeriesCohort, titleClusterCohort, randomCohort], LIMIT);
const cohortCounts = Object.fromEntries(cohorts.map((cohort) => [cohort.name, cohort.rows.length]));
const sample = cohorts.flatMap((cohort) => cohort.rows);
console.log(`Cohorts: top series ${cohortCounts["top series"]}; title clusters ${cohortCounts["title clusters"]}; random ${cohortCounts.random}; total ${sample.length}`);
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

const cachePath = path.resolve(`reports/.cover-parity-cache-${SEED}.jsonl`);
const oldCovers = await fetchOldCovers(resolverIssues, cachePath);
const fetchedCount = resolverIssues.filter((issue) => oldCovers.has(String(issue.gcd_issue_id))).length;
if (fetchedCount < resolverIssues.length) {
  console.log(`partial: ${fetchedCount} of ${resolverIssues.length} fetched, rerun to continue`);
  process.exit(0);
}

const rows = [];
const errors = [];
for (const issue of resolverIssues) {
  const oldResult = oldCovers.get(String(issue.gcd_issue_id));
  const resolved = newCovers.get(issue.gcd_issue_id);
  const newPath = resolved?.storage_path ?? null;
  if (oldResult.error) {
    errors.push({ ...issue, error: oldResult.error });
    continue;
  }
  const oldPath = oldResult.oldPath ?? null;
  const status = oldPath === newPath ? "same" : !oldPath && newPath ? "gained" : oldPath && !newPath ? "lost" : "changed";
  rows.push({ ...issue, oldPath, newPath, tier: resolved?.tier ?? "", status });
}

const counts = Object.fromEntries(["same", "gained", "lost", "changed"].map((status) => [status, rows.filter((row) => row.status === status).length]));
const date = new Date().toISOString().slice(0, 10);
const report = [
  `# Cover resolver parity — ${date}`,
  "",
  `Sample: ${resolverIssues.length}; top series: ${cohortCounts["top series"]}; title clusters: ${cohortCounts["title clusters"]}; random: ${cohortCounts.random}; seed: ${SEED}; break tier 2: ${BREAK_TIER_2 ? "yes" : "no"}`,
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
  "## Errors",
  "",
  "| Series | Year | Issue | GCD ID | Error |",
  "|---|---:|---|---:|---|",
  ...errors.map((row) =>
    `| ${row.series_title ?? ""} | ${row.year ?? ""} | ${row.issue_number ?? ""} | ${row.gcd_issue_id} | ${row.error} |`
  ),
  "",
].join("\n");
const output = path.resolve(`reports/cover-resolver-parity-${date}.md`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, report);
console.log(`Wrote ${output}`);
