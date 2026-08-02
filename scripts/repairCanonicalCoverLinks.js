// Recompute canonical-cover links with the publisher-aware shared matcher.
// Dry-run by default. Writes a local before/after report on every run.

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createCoverMatcher } from "../src/lib/coverMatch.js";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const TITLE_ARG = process.argv.find((arg) => arg.startsWith("--title="));
const TITLE = TITLE_ARG ? TITLE_ARG.slice("--title=".length).trim() : null;
const PAGE = 1000;
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { resolveCoverLink, isSeriesPublisherCompatible } = createCoverMatcher(sb);

function different(left, right) {
  if (left == null || right == null) return left !== right;
  return Number(left) !== Number(right);
}

async function fetchCovers() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = sb
      .from("canonical_covers")
      .select("id, series_title, series_year, publisher, issue_number, cover_date, in_store_date, series_gcd_id, gcd_issue_id, match_confidence")
      .order("id")
      .range(from, from + PAGE - 1);
    if (TITLE) query = query.eq("series_title", TITLE);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log(`\n=== canonical cover link repair (${APPLY ? "APPLY" : "DRY RUN"})${TITLE ? ` — ${TITLE}` : ""} ===\n`);
  const covers = await fetchCovers();
  console.log(`Loaded ${covers.length.toLocaleString()} covers.`);

  const stats = {
    scanned: 0,
    noPublisherCompatibleSeries: 0,
    conservativeSkips: 0,
    unchanged: 0,
    rowsToUpdate: 0,
    seriesCorrections: 0,
    incompatibleLinksCleared: 0,
    issueCorrections: 0,
    confidenceCorrections: 0,
    resolvedAfter: 0,
    seriesOnlyAfter: 0,
    errors: 0,
    applied: 0,
  };
  const updates = [];

  for (const cover of covers) {
    stats.scanned++;
    try {
      const dateValue = cover.cover_date || cover.in_store_date;
      const dateYear = String(dateValue ?? "").match(/^(\d{4})/)?.[1];
      const coverYear = dateYear ? Number(dateYear) : cover.series_year;
      const { seriesGcdId, gcdIssueId, matchConfidence } = await resolveCoverLink({
        title: cover.series_title,
        publisher: cover.publisher,
        issueNumber: cover.issue_number,
        coverYear,
      });

      // Never clear or replace a link based only on failure to find a match.
      // The exception is a proven publisher mismatch: retaining a known-wrong
      // structural link is worse than explicitly returning it to unresolved.
      if (seriesGcdId == null) {
        stats.noPublisherCompatibleSeries++;
        const currentCompatible = cover.series_gcd_id != null
          ? await isSeriesPublisherCompatible(cover.series_gcd_id, cover.publisher)
          : true;
        if (cover.series_gcd_id != null && currentCompatible === false) {
          const after = { series_gcd_id: null, gcd_issue_id: null, match_confidence: "unresolved" };
          stats.rowsToUpdate++;
          stats.seriesCorrections++;
          stats.incompatibleLinksCleared++;
          if (cover.gcd_issue_id != null) stats.issueCorrections++;
          if (cover.match_confidence !== "unresolved") stats.confidenceCorrections++;
          updates.push({
            id: cover.id,
            label: `${cover.series_title ?? "?"} #${cover.issue_number ?? "?"}`,
            publisher: cover.publisher,
            year: cover.series_year,
            reason: "clear-incompatible-publisher-link",
            before: {
              series_gcd_id: cover.series_gcd_id,
              gcd_issue_id: cover.gcd_issue_id,
              match_confidence: cover.match_confidence,
            },
            after,
          });
        }
        continue;
      }

      if (matchConfidence === "resolved") stats.resolvedAfter++;
      else stats.seriesOnlyAfter++;

      const seriesChanged = different(cover.series_gcd_id, seriesGcdId);
      const issueChanged = different(cover.gcd_issue_id, gcdIssueId);
      const confidenceChanged = cover.match_confidence !== matchConfidence;
      const currentPublisherCompatible = cover.series_gcd_id != null
        ? await isSeriesPublisherCompatible(cover.series_gcd_id, cover.publisher)
        : false;
      if (seriesChanged) {
        const safeSeriesCorrection = cover.series_gcd_id == null
          || currentPublisherCompatible === false
          || (cover.match_confidence !== "resolved" && matchConfidence === "resolved");
        if (!safeSeriesCorrection) {
          stats.conservativeSkips++;
          continue;
        }
      }
      if (!seriesChanged && !issueChanged && !confidenceChanged) {
        stats.unchanged++;
        continue;
      }

      if (seriesChanged) stats.seriesCorrections++;
      if (issueChanged) stats.issueCorrections++;
      if (confidenceChanged) stats.confidenceCorrections++;
      stats.rowsToUpdate++;
      updates.push({
        id: cover.id,
        label: `${cover.series_title ?? "?"} #${cover.issue_number ?? "?"}`,
        publisher: cover.publisher,
        year: cover.series_year,
        before: {
          series_gcd_id: cover.series_gcd_id,
          gcd_issue_id: cover.gcd_issue_id,
          match_confidence: cover.match_confidence,
        },
        after: {
          series_gcd_id: Number(seriesGcdId),
          gcd_issue_id: gcdIssueId,
          match_confidence: matchConfidence,
        },
      });
    } catch (error) {
      stats.errors++;
      console.error(`  row ${cover.id}: ${error.message}`);
    }
    if (stats.scanned % 1000 === 0) {
      console.log(`  audited ${stats.scanned.toLocaleString()}/${covers.length.toLocaleString()}`);
    }
  }

  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const reportPath = path.join(reportsDir, `canonical-cover-link-repair-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), apply: APPLY, stats, updates }, null, 2)}\n`);

  console.log("\nRepair plan:");
  console.log(JSON.stringify(stats, null, 2));
  console.log(`Report: ${reportPath}`);
  if (updates.length) {
    console.log("\nSample:");
    for (const row of updates.slice(0, 20)) {
      console.log(`  cc ${row.id} ${row.label} (${row.publisher}, ${row.year ?? "?"})`);
      console.log(`    ${JSON.stringify(row.before)} -> ${JSON.stringify(row.after)}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run complete; production was not changed.");
    return;
  }

  console.log("\nApplying reviewed repair plan...");
  for (const row of updates) {
    const { error } = await sb.from("canonical_covers").update(row.after).eq("id", row.id);
    if (error) {
      stats.errors++;
      console.error(`  update ${row.id}: ${error.message}`);
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
  console.error("repair failed:", error);
  process.exit(1);
});
