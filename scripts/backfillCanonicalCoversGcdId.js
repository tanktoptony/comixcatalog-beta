// Backfill structural GCD links for every existing canonical cover.
//
// Dry-run by default. Pass --apply only after reviewing the production counts.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createCoverMatcher } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const MAX_ROWS = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : Infinity;
const PAGE = 1000;

if ((MAX_ROWS !== Infinity && !Number.isFinite(MAX_ROWS)) || MAX_ROWS <= 0) {
  throw new Error("--limit must be a positive number");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { resolveCoverLink, resolveGcdIssueId } = createCoverMatcher(supabase);

const stats = {
  scanned: 0,
  unchangedRows: 0,
  rowsToUpdate: 0,
  seriesGcdIdToSet: 0,
  seriesGcdIdToChange: 0,
  gcdIssueIdToSet: 0,
  gcdIssueIdToChange: 0,
  confidenceToChange: 0,
  resolved: 0,
  seriesOnly: 0,
  unresolved: 0,
  errors: 0,
  applied: 0,
};

async function fetchRows() {
  const rows = [];
  for (let from = 0; rows.length < MAX_ROWS; from += PAGE) {
    const remaining = Math.min(PAGE, MAX_ROWS - rows.length);
    const { data, error } = await supabase
      .from("canonical_covers")
      .select("id, series_title, series_year, publisher, issue_number, cover_date, in_store_date, series_gcd_id, gcd_issue_id, match_confidence")
      .order("id")
      .range(from, from + remaining - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < remaining) break;
  }
  return rows;
}

function changed(current, next) {
  return current == null ? next != null : Number(current) !== Number(next);
}

async function planRow(row) {
  stats.scanned++;
  try {
    let seriesGcdId = row.series_gcd_id == null ? null : Number(row.series_gcd_id);
    let issueResult;
    if (seriesGcdId == null) {
      const dateValue = row.cover_date || row.in_store_date;
      const dateYear = String(dateValue ?? "").match(/^(\d{4})/)?.[1];
      const resolved = await resolveCoverLink({
        title: row.series_title,
        publisher: row.publisher,
        issueNumber: row.issue_number,
        coverYear: dateYear ? Number(dateYear) : row.series_year,
      });
      seriesGcdId = resolved.seriesGcdId;
      issueResult = resolved;
    } else {
      issueResult = await resolveGcdIssueId({ seriesGcdId, issueNumber: row.issue_number });
    }
    const { gcdIssueId, matchConfidence } = issueResult;

    if (matchConfidence === "resolved") stats.resolved++;
    else if (matchConfidence === "series-only") stats.seriesOnly++;
    else stats.unresolved++;

    const seriesChanged = changed(row.series_gcd_id, seriesGcdId);
    const issueChanged = changed(row.gcd_issue_id, gcdIssueId);
    const confidenceChanged = row.match_confidence !== matchConfidence;

    if (seriesChanged) {
      if (row.series_gcd_id == null) stats.seriesGcdIdToSet++;
      else stats.seriesGcdIdToChange++;
    }
    if (issueChanged) {
      if (row.gcd_issue_id == null) stats.gcdIssueIdToSet++;
      else stats.gcdIssueIdToChange++;
    }
    if (confidenceChanged) stats.confidenceToChange++;

    if (!seriesChanged && !issueChanged && !confidenceChanged) {
      stats.unchangedRows++;
      return null;
    }

    stats.rowsToUpdate++;
    return {
      id: row.id,
      before: {
        series_gcd_id: row.series_gcd_id,
        gcd_issue_id: row.gcd_issue_id,
        match_confidence: row.match_confidence,
      },
      after: {
        series_gcd_id: seriesGcdId,
        gcd_issue_id: gcdIssueId,
        match_confidence: matchConfidence,
      },
      label: `${row.series_title ?? "?"} #${row.issue_number ?? "?"}`,
    };
  } catch (error) {
    console.error("  row error:", row.id, row.series_title, error.message);
    stats.errors++;
    return null;
  }
}

async function main() {
  console.log(`\n=== canonical cover GCD-link backfill (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const { error: probeError } = await supabase
    .from("canonical_covers")
    .select("series_gcd_id, gcd_issue_id, match_confidence")
    .limit(1);
  if (probeError) throw new Error(`Apply migrations 0009 and 0018 before running: ${probeError.message}`);

  const rows = await fetchRows();
  console.log(`Loaded ${rows.length.toLocaleString()} canonical covers.`);

  const updates = [];
  for (const row of rows) {
    const update = await planRow(row);
    if (update) updates.push(update);
    if (stats.scanned % 1000 === 0) {
      console.log(`  planned ${stats.scanned.toLocaleString()}/${rows.length.toLocaleString()}`);
    }
  }

  console.log("\nProduction plan:");
  console.log(JSON.stringify(stats, null, 2));
  if (updates.length) {
    console.log("\nSample planned updates:");
    for (const update of updates.slice(0, 10)) {
      console.log(`  ${update.id} ${update.label}`);
      console.log(`    ${JSON.stringify(update.before)} -> ${JSON.stringify(update.after)}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run complete; no production rows were changed. Pass --apply only after review.");
    return;
  }

  console.log("\nApplying planned updates...");
  for (const update of updates) {
    const { error } = await supabase
      .from("canonical_covers")
      .update(update.after)
      .eq("id", update.id);
    if (error) {
      console.error("  update error:", update.id, error.message);
      stats.errors++;
    } else {
      stats.applied++;
    }
    if (stats.applied > 0 && stats.applied % 500 === 0) {
      console.log(`  applied ${stats.applied.toLocaleString()}/${updates.length.toLocaleString()}`);
    }
  }
  console.log(`\nApply complete: ${stats.applied.toLocaleString()} updated, ${stats.errors.toLocaleString()} errors.`);
}

main().catch((error) => {
  console.error("backfill failed:", error);
  process.exit(1);
});
