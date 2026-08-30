// Resolves scripts/data/keyIssuesSeed.js entries to real gcd_issue_ids and
// upserts them into the key_issues table (migration 0026).
//
// Matching approach mirrors the year-tolerance guard already proven in
// /api/library-hydrate and refreshSeriesSearchCache.js: title -> candidate
// gcd_series rows -> candidate gcd_issues by issue_number -> keep only
// issues whose own year (publication_date -> key_date fallback) lands
// within YEAR_TOLERANCE of the seed entry's year. Anything that resolves to
// zero or more-than-one candidate is reported, not guessed — a wrong pin is
// worse than a missing one (same lesson as the Silver Surfer / Excalibur
// duplicate-series-row incidents this repo has already been burned by).
//
// Usage: node scripts/resolveKeyIssues.js [--dry-run]

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { KEY_ISSUES } from "./data/keyIssuesSeed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const YEAR_TOLERANCE = 1;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function bestYearFor(row) {
  return parseYear(row.publication_date) ?? parseYear(row.key_date);
}

// Populated once in main() — gcd_publishers.gcd_id -> name. Used to narrow
// a cross-series ambiguity (e.g. an English printing vs. a foreign-language
// edition sharing the series name) down by publisher before giving up.
const publisherNameCache = new Map();

async function resolveOne(entry) {
  const { data: seriesRows, error: seriesErr } = await supabase
    .from("gcd_series")
    .select("gcd_id, name, publisher_gcd_id")
    .ilike("name", entry.title);
  if (seriesErr) throw seriesErr;
  if (!seriesRows || seriesRows.length === 0) {
    return { status: "no-series-match", entry };
  }

  const seriesIds = seriesRows.map((s) => s.gcd_id);
  const { data: issueRows, error: issueErr } = await supabase
    .from("gcd_issues")
    .select("gcd_id, issue_number, series_gcd_id, publication_date, key_date")
    .in("series_gcd_id", seriesIds)
    .eq("issue_number", entry.issueNumber);
  if (issueErr) throw issueErr;
  if (!issueRows || issueRows.length === 0) {
    return { status: "no-issue-match", entry };
  }

  let withinYear = issueRows.filter((row) => {
    const y = bestYearFor(row);
    return y != null && Math.abs(y - entry.year) <= YEAR_TOLERANCE;
  });

  if (withinYear.length === 0) {
    return { status: "no-year-match", entry, candidates: issueRows.length };
  }

  // GCD frequently catalogs the same print run's issue twice (a later
  // reprint-dataset merge, a foreign edition sharing the series row) — same
  // series_gcd_id, same content. Collapse those to one winner (lowest
  // gcd_id, i.e. earliest catalogued) rather than flagging as ambiguous;
  // that's a real duplicate-row artifact, not a genuine cross-volume
  // question. Only different series_gcd_id values are a real ambiguity.
  const distinctSeriesIds = new Set(withinYear.map((r) => r.series_gcd_id));
  if (distinctSeriesIds.size > 1 && entry.publisher) {
    // Cross-volume ambiguity (e.g. an English printing vs. a foreign-
    // language edition sharing the series name) — narrow by publisher
    // before giving up, same guard /api/library-hydrate leans on.
    const publisherIds = seriesRows
      .filter((s) =>
        s.publisher_gcd_id != null &&
        publisherNameCache.get(s.publisher_gcd_id)?.toLowerCase().includes(entry.publisher.toLowerCase())
      )
      .map((s) => s.gcd_id);
    const narrowed = withinYear.filter((r) => publisherIds.includes(r.series_gcd_id));
    if (narrowed.length > 0) withinYear = narrowed;
  }

  const remainingSeriesIds = new Set(withinYear.map((r) => r.series_gcd_id));
  if (remainingSeriesIds.size > 1) {
    // Last tie-break before giving up: two distinct series can both fall
    // within YEAR_TOLERANCE (e.g. a debut issue's true date vs. a separate
    // "series" row GCD split off for a later reprint edition one year out)
    // — prefer whichever candidate's actual year is CLOSEST to the seed's
    // target year. Only remains genuinely ambiguous on an exact tie.
    const bestDistance = Math.min(
      ...withinYear.map((r) => Math.abs(bestYearFor(r) - entry.year))
    );
    const closest = withinYear.filter(
      (r) => Math.abs(bestYearFor(r) - entry.year) === bestDistance
    );
    const closestSeriesIds = new Set(closest.map((r) => r.series_gcd_id));
    if (closestSeriesIds.size > 1) {
      return { status: "ambiguous", entry, candidates: remainingSeriesIds.size };
    }
    withinYear = closest;
  }

  const winner = [...withinYear].sort((a, b) => a.gcd_id - b.gcd_id)[0];
  return { status: "resolved", entry, gcd_issue_id: winner.gcd_id };
}

async function loadPublisherNames() {
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("gcd_publishers")
      .select("gcd_id, name")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) publisherNameCache.set(row.gcd_id, row.name);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
}

async function main() {
  await loadPublisherNames();
  const results = { resolved: [], unresolved: [] };

  for (const entry of KEY_ISSUES) {
    const result = await resolveOne(entry);
    if (result.status === "resolved") {
      results.resolved.push(result);
    } else {
      results.unresolved.push(result);
    }
  }

  console.log(`Resolved: ${results.resolved.length} / ${KEY_ISSUES.length}`);
  if (results.unresolved.length > 0) {
    console.log("\nUnresolved entries (fix or drop from keyIssuesSeed.js):");
    for (const r of results.unresolved) {
      console.log(
        `  [${r.status}] ${r.entry.title} #${r.entry.issueNumber} (${r.entry.year}) — ${r.entry.character}` +
          (r.candidates != null ? ` (${r.candidates} candidate(s))` : "")
      );
    }
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: not writing to key_issues.");
    return;
  }

  if (results.resolved.length === 0) {
    console.log("\nNothing resolved — skipping upsert.");
    return;
  }

  const rows = results.resolved.map((r) => ({
    gcd_issue_id: r.gcd_issue_id,
    title: r.entry.title,
    issue_number: r.entry.issueNumber,
    publisher: r.entry.publisher,
    year: r.entry.year,
    character: r.entry.character,
    reason: r.entry.reason,
    tier: r.entry.tier,
  }));

  const { error: upsertErr } = await supabase
    .from("key_issues")
    .upsert(rows, { onConflict: "gcd_issue_id" });
  if (upsertErr) throw upsertErr;

  console.log(`\nUpserted ${rows.length} rows into key_issues.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
