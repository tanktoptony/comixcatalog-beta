import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { classifyCorrection, classifyScanOutcome, OUTCOMES } from "./lib/scanAccuracyReport.js";

dotenv.config({ path: ".env.local", quiet: true });

const PAGE_SIZE = 1000;
const jsonMode = process.argv.includes("--json");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function allScans() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from("cover_scans")
      .select("id,user_id,created_at,model,extracted,candidates,outcome,chosen_gcd_issue_id,input_tokens,output_tokens")
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function rowsByIds(table, select, column, ids) {
  const found = [];
  for (let index = 0; index < ids.length; index += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(select).in(column, ids.slice(index, index + PAGE_SIZE));
    if (error) throw error;
    found.push(...data);
  }
  return found;
}

const countBy = (rows, key) => rows.reduce((map, row) => {
  const value = key(row);
  map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}, new Map());
const ranked = (map, limit = 20) => [...map].map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name))).slice(0, limit);
const display = (value) => String(value ?? "").trim() || "Unknown";
const percent = (count, total) => total ? `${(count * 100 / total).toFixed(1)}%` : "0.0%";

const scans = await allScans();
const outcomeCounts = Object.fromEntries(Object.values(OUTCOMES).map((name) => [name, 0]));
outcomeCounts.unknown = 0;
for (const row of scans) outcomeCounts[classifyScanOutcome(row)] += 1;

const userCounts = countBy(scans, (row) => row.user_id);
const topUserIds = ranked(userCounts, 5).map((row) => row.name);
const profiles = topUserIds.length ? await rowsByIds("profiles", "id,username", "id", topUserIds) : [];
const usernames = new Map(profiles.map((row) => [row.id, row.username]));
const topScanners = ranked(userCounts, 5).map(({ name, count }) => ({ username: usernames.get(name) || "(no username)", count }));

const now = new Date();
const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
const dayCounts = countBy(scans.filter((row) => new Date(row.created_at) >= firstDay), (row) => row.created_at.slice(0, 10));
const last30Days = Array.from({ length: 30 }, (_, offset) => {
  const date = new Date(firstDay); date.setUTCDate(date.getUTCDate() + offset);
  const day = date.toISOString().slice(0, 10);
  return { day, scans: dayCounts.get(day) ?? 0 };
});

const corrected = scans.filter((row) => classifyScanOutcome(row) === OUTCOMES.corrected);
const issueIds = [...new Set(corrected.flatMap((row) => [row.candidates?.[0]?.gcd_issue_id, row.chosen_gcd_issue_id]).filter(Number.isInteger))];
const issues = issueIds.length ? await rowsByIds("gcd_issues", "gcd_id,series_gcd_id,issue_number,publication_date,key_date", "gcd_id", issueIds) : [];
const issueById = new Map(issues.map((row) => [Number(row.gcd_id), row]));
const seriesIds = [...new Set(issues.map((row) => row.series_gcd_id).filter(Number.isInteger))];
const series = seriesIds.length ? await rowsByIds("series", "gcd_id,title,year_start_cached,resolved_publisher_cached", "gcd_id", seriesIds) : [];
const seriesById = new Map(series.map((row) => [Number(row.gcd_id), row]));
const correctionCounts = new Map();
const correctedSeries = new Map();
for (const row of corrected) {
  const suggestedIssue = issueById.get(Number(row.candidates?.[0]?.gcd_issue_id));
  const chosenIssue = issueById.get(Number(row.chosen_gcd_issue_id));
  const withSeries = (issue) => issue && { ...issue, series_title: seriesById.get(Number(issue.series_gcd_id))?.title };
  const relation = classifyCorrection(withSeries(suggestedIssue), withSeries(chosenIssue));
  correctionCounts.set(relation, (correctionCounts.get(relation) ?? 0) + 1);
  const title = display(seriesById.get(Number(suggestedIssue?.series_gcd_id))?.title ?? row.candidates?.[0]?.series_title);
  correctedSeries.set(title, (correctedSeries.get(title) ?? 0) + 1);
}

const gaps = scans.filter((row) => [OUTCOMES.notInCatalog, OUTCOMES.noMatch].includes(classifyScanOutcome(row)));
const gapStats = (kind) => {
  const rows = gaps.filter((row) => classifyScanOutcome(row) === kind);
  return {
    count: rows.length,
    publishers: ranked(countBy(rows, (row) => display(row.extracted?.publisher))),
    seriesTitles: ranked(countBy(rows, (row) => display(row.extracted?.series_title))),
  };
};

const report = {
  generatedAt: now.toISOString(),
  totals: { scans: scans.length, uniqueUsers: userCounts.size, last30Days, topScanners },
  outcomes: {
    matchedAndAdded: null,
    matchedSelectedSuggestion: outcomeCounts[OUTCOMES.selectedSuggestion],
    matchedDifferentIssue: outcomeCounts[OUTCOMES.corrected],
    matchedAbandoned: outcomeCounts[OUTCOMES.abandoned],
    noMatchOrNotAComic: outcomeCounts[OUTCOMES.noMatch],
    notInCatalog: outcomeCounts[OUTCOMES.notInCatalog],
    errors: outcomeCounts[OUTCOMES.error], capped: outcomeCounts[OUTCOMES.capped], unknown: outcomeCounts.unknown,
  },
  corrections: { relations: Object.fromEntries(correctionCounts), topCorrectedSeries: ranked(correctedSeries) },
  gaps: { notInCatalog: gapStats(OUTCOMES.notInCatalog), noMatchOrNotAComic: gapStats(OUTCOMES.noMatch) },
  models: ranked(countBy(scans, (row) => display(row.model))),
  tokens: {
    input: scans.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
    output: scans.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
    rowsWithUsage: scans.filter((row) => row.input_tokens != null || row.output_tokens != null).length,
  },
  latency: null,
  limitations: [
    "matched and added cannot be derived: chosen_gcd_issue_id is set both after an add and by the already-owned photo flow, and no collection id or action is stored",
    "a null chosen_gcd_issue_id is reported as abandoned, but it only proves that no choice was recorded",
    "stored outcome not_a_comic combines a model judgment that the image is not a comic with low-confidence comic scans that found no candidates",
    "not_in_catalog means a medium/high-confidence comic extraction found no candidates; it cannot distinguish a true catalog gap from an identifier/search miss",
    "latency cannot be calculated because cover_scans stores only created_at, not request start/completion timestamps",
    "model is stored, but prompt/schema version is not",
  ],
};

function table(items, first = "Name") {
  if (!items.length) return "_None_";
  return `| ${first} | Count |\n|---|---:|\n${items.map((item) => `| ${String(item.name).replaceAll("|", "\\|")} | ${item.count} |`).join("\n")}`;
}

function markdown(value) {
  const outcomes = value.outcomes;
  return `# Cover scan accuracy report\n\nGenerated ${value.generatedAt}\n\n## Totals\n\n- Scans: ${value.totals.scans}\n- Unique users: ${value.totals.uniqueUsers}\n- Matched and added: not derivable from stored columns\n\n### Last 30 days (UTC)\n\n| Day | Scans |\n|---|---:|\n${value.totals.last30Days.map((row) => `| ${row.day} | ${row.scans} |`).join("\n")}\n\n### Top scanners\n\n${table(value.totals.topScanners.map((row) => ({ name: row.username, count: row.count })), "Username")}\n\n## Outcomes\n\n| Outcome | Count | Share | Stored-column definition |\n|---|---:|---:|---|\n| Matched and selected suggested issue | ${outcomes.matchedSelectedSuggestion} | ${percent(outcomes.matchedSelectedSuggestion, value.totals.scans)} | outcome=matched; chosen_gcd_issue_id equals candidates[0].gcd_issue_id |\n| Matched but selected a different issue | ${outcomes.matchedDifferentIssue} | ${percent(outcomes.matchedDifferentIssue, value.totals.scans)} | outcome=matched; chosen_gcd_issue_id differs from candidates[0].gcd_issue_id |\n| Matched but abandoned | ${outcomes.matchedAbandoned} | ${percent(outcomes.matchedAbandoned, value.totals.scans)} | outcome=matched; chosen_gcd_issue_id is null |\n| No match / not a comic | ${outcomes.noMatchOrNotAComic} | ${percent(outcomes.noMatchOrNotAComic, value.totals.scans)} | stored outcome=not_a_comic; the two cases cannot be separated |\n| Not in catalog | ${outcomes.notInCatalog} | ${percent(outcomes.notInCatalog, value.totals.scans)} | stored outcome=not_in_catalog |\n| Errors | ${outcomes.errors} | ${percent(outcomes.errors, value.totals.scans)} | stored outcome=error |\n| Capped attempts | ${outcomes.capped} | ${percent(outcomes.capped, value.totals.scans)} | stored outcome=capped |\n| Unknown | ${outcomes.unknown} | ${percent(outcomes.unknown, value.totals.scans)} | unrecognized stored outcome |\n\n## Corrections\n\n${table(Object.entries(value.corrections.relations).map(([name, count]) => ({ name, count })), "Relationship")}\n\n### Top corrected series\n\n${table(value.corrections.topCorrectedSeries, "Suggested series")}\n\n## Catalog gaps and identifier misses\n\n### Not in catalog: publishers\n\n${table(value.gaps.notInCatalog.publishers)}\n\n### Not in catalog: series titles\n\n${table(value.gaps.notInCatalog.seriesTitles)}\n\n### No match / not a comic: publishers\n\n${table(value.gaps.noMatchOrNotAComic.publishers)}\n\n### No match / not a comic: series titles\n\n${table(value.gaps.noMatchOrNotAComic.seriesTitles)}\n\n## Model and usage\n\n${table(value.models, "Model")}\n\n- Rows with token usage: ${value.tokens.rowsWithUsage}\n- Input tokens: ${value.tokens.input}\n- Output tokens: ${value.tokens.output}\n- Prompt/schema version: not stored\n- Latency: not derivable\n\n## Data limitations\n\n${value.limitations.map((item) => `- ${item}`).join("\n")}\n`;
}

process.stdout.write(jsonMode ? `${JSON.stringify(report, null, 2)}\n` : markdown(report));
