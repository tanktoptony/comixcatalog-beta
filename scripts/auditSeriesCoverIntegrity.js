// Read-only cover integrity audit.
//
// Emits one row per GCD series with coverage counts and a repair category:
//   covered, partial, missing, wrong_year, ambiguous
//
// Matching is ID-first. The title/issue fallback is deliberately conservative:
// publisher must match, and the cover year must be within ±1 year of the GCD
// issue year. No database writes are performed.
//
// Usage:
//   node scripts/auditSeriesCoverIntegrity.js
//   node scripts/auditSeriesCoverIntegrity.js --out reports/cover-integrity.csv
//   node scripts/auditSeriesCoverIntegrity.js --user-only

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const USER_ONLY = args.includes("--user-only");
const OUT = path.resolve(arg("out", "reports/cover-integrity.csv"));
const PAGE = 1000;

const norm = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function publisher(value) {
  return norm(value)
    .replace(/\b(comics|entertainment|publishing|inc\.?|llc|ltd|company|co\.?)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}
function year(value) {
  const match = String(value ?? "").match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}
function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
async function page(query) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const series = await page(() => supabase
  .from("series")
  .select("id,gcd_id,title,year_start_cached,year_end_cached,issue_count_cached,resolved_publisher_cached,featured_cover_path_cached")
  .not("gcd_id", "is", null)
  .order("gcd_id"));

let targets = series;
if (USER_ONLY) {
  const collections = await page(() => supabase
    .from("user_collections")
    .select("gcd_issue_id")
    .not("gcd_issue_id", "is", null));
  const issueIds = [...new Set(collections.map((row) => row.gcd_issue_id).filter(Boolean))];
  const touched = new Set();
  for (let i = 0; i < issueIds.length; i += 500) {
    const { data, error } = await supabase.from("gcd_issues").select("series_gcd_id").in("gcd_id", issueIds.slice(i, i + 500));
    if (error) throw error;
    for (const row of data ?? []) if (row.series_gcd_id != null) touched.add(Number(row.series_gcd_id));
  }
  targets = series.filter((row) => touched.has(Number(row.gcd_id)));
}

const issues = await page(() => supabase
  .from("gcd_issues")
  .select("gcd_id,series_gcd_id,issue_number,publication_date")
  .order("gcd_id"));
const issuesBySeries = new Map();
for (const issue of issues) {
  const key = Number(issue.series_gcd_id);
  if (!issuesBySeries.has(key)) issuesBySeries.set(key, []);
  issuesBySeries.get(key).push(issue);
}

const covers = await page(() => supabase
  .from("canonical_covers")
  .select("series_gcd_id,gcd_issue_id,series_title,publisher,issue_number,series_year,cover_date,storage_path")
  .not("storage_path", "is", null));
const coversByIssue = new Map();
const coversByKey = new Map();
for (const cover of covers) {
  if (cover.gcd_issue_id != null) coversByIssue.set(Number(cover.gcd_issue_id), cover);
  const key = `${norm(cover.series_title)}|${norm(cover.issue_number)}|${publisher(cover.publisher)}`;
  if (!coversByKey.has(key)) coversByKey.set(key, []);
  coversByKey.get(key).push(cover);
}

const rows = [];
for (const s of targets) {
  const seriesIssues = issuesBySeries.get(Number(s.gcd_id)) ?? [];
  let exact = 0;
  let fallback = 0;
  let wrongYear = 0;
  let ambiguous = 0;
  const examples = [];
  for (const issue of seriesIssues) {
    const issueYear = year(issue.publication_date);
    if (coversByIssue.has(Number(issue.gcd_id))) {
      exact++;
      continue;
    }
    const key = `${norm(s.title)}|${norm(issue.issue_number)}|${publisher(s.resolved_publisher_cached)}`;
    const candidates = coversByKey.get(key) ?? [];
    const eligible = candidates.filter((cover) => {
      const coverYear = cover.series_year ?? year(cover.cover_date);
      return issueYear == null || coverYear == null || Math.abs(Number(coverYear) - issueYear) <= 1;
    });
    if (eligible.length === 1) fallback++;
    else if (eligible.length > 1) { ambiguous++; if (examples.length < 3) examples.push(issue.issue_number); }
    else if (candidates.length > 0) { wrongYear++; if (examples.length < 3) examples.push(issue.issue_number); }
  }
  const covered = exact + fallback;
  const category = seriesIssues.length === 0 || covered === seriesIssues.length
    ? "covered"
    : covered === 0
      ? (wrongYear > 0 ? "wrong_year" : ambiguous > 0 ? "ambiguous" : "missing")
      : (wrongYear > 0 ? "partial_wrong_year" : ambiguous > 0 ? "partial_ambiguous" : "partial");
  rows.push({
    category,
    gcd_id: s.gcd_id,
    title: s.title,
    publisher: s.resolved_publisher_cached,
    year_start: s.year_start_cached,
    year_end: s.year_end_cached,
    issue_count: seriesIssues.length,
    exact_id_covers: exact,
    safe_fallback_covers: fallback,
    wrong_year_candidates: wrongYear,
    ambiguous_candidates: ambiguous,
    featured_cover: Boolean(s.featured_cover_path_cached),
    example_issue_numbers: examples.join(";")
  });
}

rows.sort((a, b) => `${a.category}${a.title}`.localeCompare(`${b.category}${b.title}`));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const columns = Object.keys(rows[0] ?? { category: "" });
fs.writeFileSync(OUT, `${columns.join(",")}\n${rows.map((row) => columns.map((key) => csv(row[key])).join(",")).join("\n")}\n`);
const counts = {};
for (const row of rows) counts[row.category] = (counts[row.category] ?? 0) + 1;
console.log(`Wrote ${rows.length} series to ${OUT}`);
for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`);
