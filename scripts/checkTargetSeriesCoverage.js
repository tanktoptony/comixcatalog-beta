// Accurate (year-tolerant, publisher-gated) coverage check for a fixed list
// of gcd_id targets — same matching logic as findUncoveredSeries.js, just
// scoped to specific series instead of a full-DB scan. Read-only.
//
// Usage: node scripts/checkTargetSeriesCoverage.js
// Writes: scripts/tony_stack_targets.json  (paste-ready for the Python ingester)

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_GCD_IDS = [
  3654,   // Marvel Comics Presents (1988-1995)
  3345,   // Adventures of Superman (1987-2006)
  4741,   // Thunderstrike (1993-1995)
  4253,   // X-Force (1991-2002)
  18474,  // X-Force and Spider-Man: Sabotage (1992)
  4719,   // Night Thrasher (1993-1995)
  4464,   // Night Thrasher: Four Control (1992-1993)
  3209,   // X-Factor (1986-1998)
  2355,   // Nova (1976-1978)
  7191,   // X-Men Classic (1990-1995)
  3176,   // Classic X-Men (1986-1990)
  2605,   // Uncanny X-Men (1981-2011)
  4035,   // The New Warriors (1990-1996)
];

const YEAR_TOLERANCE = 1;

function norm(s) { return String(s ?? "").trim().toLowerCase(); }
function normPublisher(value) {
  if (!value) return "";
  let s = String(value).trim().toLowerCase();
  s = s.replace(/\b(comics|entertainment|publishing|inc\.?|llc|ltd|company|co\.?)\b/g, "");
  s = s.replace(/[^a-z0-9]+/g, "");
  return s;
}
function parseYear(value) {
  if (!value) return null;
  const m = String(value).match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

async function paginate(builderFn) {
  const out = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await builderFn().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function run() {
  const { data: seriesRows, error: sErr } = await supabase
    .from("series")
    .select("id, gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached, issue_count_cached")
    .in("gcd_id", TARGET_GCD_IDS);
  if (sErr) throw sErr;

  const targets = [];
  for (const s of seriesRows) {
    const { data: issues } = await supabase
      .from("gcd_issues")
      .select("issue_number, publication_date")
      .eq("series_gcd_id", s.gcd_id);

    const ccRows = await paginate(() =>
      supabase
        .from("canonical_covers")
        .select("issue_number, series_year, cover_date, publisher")
        .eq("series_title", s.title)
        .not("storage_path", "is", null)
    );

    const candidatesByIssue = new Map();
    const seriesPub = normPublisher(s.resolved_publisher_cached);
    for (const c of ccRows) {
      if (seriesPub && normPublisher(c.publisher) !== seriesPub) continue;
      const key = norm(c.issue_number);
      const year = c.series_year ?? parseYear(c.cover_date);
      const list = candidatesByIssue.get(key) ?? [];
      list.push(year);
      candidatesByIssue.set(key, list);
    }

    let covered = 0;
    const missingIssues = [];
    for (const i of issues ?? []) {
      const key = norm(i.issue_number);
      const years = candidatesByIssue.get(key);
      const targetYear = parseYear(i.publication_date) ?? s.year_start_cached ?? null;
      let hit = false;
      if (years && years.length) {
        if (targetYear == null) hit = true;
        else hit = years.some((y) => y != null && Math.abs(y - targetYear) <= YEAR_TOLERANCE);
      }
      if (hit) covered += 1;
      else missingIssues.push(i.issue_number);
    }

    const total = (issues ?? []).length;
    targets.push({
      gcd_id: s.gcd_id,
      name: s.title,
      publisher: s.resolved_publisher_cached || "Marvel Comics",
      year: s.year_start_cached,
      total,
      covered,
      uncovered: total - covered,
      missingIssues,
    });
  }

  console.log("gcd_id  | title                                     | year      | total | covered | uncovered");
  console.log("-".repeat(100));
  for (const t of targets) {
    const yr = t.year ?? "?";
    console.log(
      `${String(t.gcd_id).padEnd(7)} | ${t.name.padEnd(41).slice(0,41)} | ${String(yr).padEnd(9)} | ${String(t.total).padStart(5)} | ${String(t.covered).padStart(7)} | ${String(t.uncovered).padStart(9)}`
    );
  }

  const ingestable = targets.filter((t) => t.uncovered > 0 || t.total === 0);
  const jsonTargets = ingestable.map((t) => ({ name: t.name, publisher: t.publisher, year: t.year }));
  const outPath = path.resolve(__dirname, "tony_stack_targets.json");
  fs.writeFileSync(outPath, JSON.stringify(jsonTargets, null, 2) + "\n");
  console.log(`\nWrote ${jsonTargets.length} ingest targets -> ${outPath}`);

  console.log("\nMissing-issue detail (first 15 per series):");
  for (const t of targets) {
    if (t.uncovered === 0 && t.total > 0) continue;
    console.log(`  ${t.name} (${t.year ?? "?"}): ${t.missingIssues.slice(0, 15).join(", ")}${t.missingIssues.length > 15 ? ", ..." : ""}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
