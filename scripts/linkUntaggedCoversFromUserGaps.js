// linkUntaggedCoversFromUserGaps.js
//
// For every (gcd_series, issue_number) a user owns that currently lacks a
// canonical_cover match, search canonical_covers for plausible candidates
// (issue_number match + normalized title overlap + year window) and tag
// them with that gcd_series_id. Fixes the multi-CV-volume problem where
// GCD treats a long-running series as one (e.g. Marvel Tales #1-291) but
// CV splits it into multiple volumes with slightly different titles
// ("Marvel Tales", "Marvel Tales Starring Spider-Man", "Marvel Tales
// Featuring Spider-Man").
//
// Dry-run by default. Pass --apply to write.

import "dotenv/config";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilar(gcdTitle, ccTitle) {
  const a = norm(gcdTitle);
  const b = norm(ccTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  // One is prefix of the other (e.g. "marvel tales" vs "marvel tales featuring spider man")
  if (b.startsWith(a + " ") || a.startsWith(b + " ")) return true;
  // Shared first 2 words (publisher pattern: "marvel tales <suffix>")
  const wa = a.split(" "), wb = b.split(" ");
  if (wa.length >= 2 && wb.length >= 2 && wa[0] === wb[0] && wa[1] === wb[1]) return true;
  return false;
}

async function fetchAllPages(builder, pageSize = 1000) {
  let from = 0, all = [];
  for (;;) {
    const { data, error } = await builder.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  console.log("Finding user-owned issues with no canonical_cover link…");

  // 1. All user_collections rows with a gcd_issue_id.
  const ucRows = await fetchAllPages(
    sb.from("user_collections").select("id, gcd_issue_id").not("gcd_issue_id", "is", null)
  );
  console.log(`  ${ucRows.length} user_collections rows with gcd_issue_id`);

  // 2. Resolve gcd_issues -> (series_gcd_id, issue_number).
  const gcdIds = [...new Set(ucRows.map(r => r.gcd_issue_id))];
  const issues = [];
  for (let i = 0; i < gcdIds.length; i += 500) {
    const chunk = gcdIds.slice(i, i + 500);
    const { data } = await sb
      .from("gcd_issues")
      .select("gcd_id, issue_number, series_gcd_id, publication_date, key_date")
      .in("gcd_id", chunk);
    if (data) issues.push(...data);
  }
  console.log(`  ${issues.length} gcd_issues resolved`);

  // 3. Build (series_gcd_id, issue_number) set of user-needed coverage.
  const needed = new Map(); // key: `${series}|${issue#}` -> { series, issue, year }
  for (const iss of issues) {
    const key = `${iss.series_gcd_id}|${String(iss.issue_number).trim()}`;
    if (!needed.has(key)) {
      const year = iss.key_date?.slice(0, 4) || iss.publication_date?.match(/\d{4}/)?.[0] || null;
      needed.set(key, { series: iss.series_gcd_id, issue: String(iss.issue_number).trim(), year: year ? Number(year) : null });
    }
  }
  console.log(`  ${needed.size} distinct (series, issue#) pairs needed`);

  // 4. Load gcd_series for title + year-range context.
  const seriesIds = [...new Set([...needed.values()].map(n => n.series))];
  const seriesMeta = new Map();
  for (let i = 0; i < seriesIds.length; i += 500) {
    const chunk = seriesIds.slice(i, i + 500);
    const { data } = await sb
      .from("gcd_series")
      .select("gcd_id, name, year_began, year_ended")
      .in("gcd_id", chunk);
    if (data) for (const s of data) seriesMeta.set(s.gcd_id, s);
  }

  // 5. Find which of the needed pairs already have a canonical_cover tagged.
  let resolved = 0;
  const unresolved = [];
  for (const [key, n] of needed) {
    const { count } = await sb
      .from("canonical_covers")
      .select("id", { count: "exact", head: true })
      .eq("series_gcd_id", n.series)
      .eq("issue_number", n.issue);
    if (count && count > 0) { resolved++; continue; }
    unresolved.push(n);
  }
  console.log(`  ${resolved} already covered, ${unresolved.length} need linking`);

  // 6. For each unresolved, find candidate canonical_covers by issue# + title-similar + plausible year.
  let linked = 0, ambiguous = 0, noMatch = 0;
  const updates = [];
  for (const need of unresolved) {
    const sMeta = seriesMeta.get(need.series);
    if (!sMeta) { noMatch++; continue; }

    // Pull all canonical_covers with matching issue_number — including ones
    // already tagged. We may need to RETAG when the current tag points to a
    // foreign-language or unrelated GCD series (the propagator mistagged a
    // lot of rows this way).
    const { data: candidates } = await sb
      .from("canonical_covers")
      .select("id, series_title, series_year, issue_number, comicvine_volume_id, series_gcd_id")
      .eq("issue_number", need.issue);
    if (!candidates || candidates.length === 0) { noMatch++; continue; }

    // Filter by title similarity + year window.
    const yearLow = sMeta.year_began ? sMeta.year_began - 1 : null;
    const yearHigh = sMeta.year_ended || (sMeta.year_began ? sMeta.year_began + 60 : null);

    const matches = candidates.filter(c => {
      if (!titleSimilar(sMeta.name, c.series_title)) return false;
      if (c.series_year && yearLow && yearHigh) {
        if (c.series_year < yearLow || c.series_year > yearHigh + 1) return false;
      }
      // Skip candidates already tagged to the TARGET series (already linked).
      if (c.series_gcd_id === need.series) return false;
      return true;
    });

    if (matches.length === 0) { noMatch++; continue; }
    if (matches.length > 1) {
      // Pick the one whose CV start_year is closest to gcd year_began as tiebreaker.
      matches.sort((a, b) => {
        const da = Math.abs((a.series_year || 0) - (sMeta.year_began || 0));
        const db = Math.abs((b.series_year || 0) - (sMeta.year_began || 0));
        return da - db;
      });
      ambiguous++;
    }
    updates.push({ id: matches[0].id, series: need.series, issue: need.issue, title: matches[0].series_title });
    linked++;
  }

  console.log(`\nLinkable: ${linked}  (${ambiguous} resolved from ambiguous)  NoMatch: ${noMatch}`);
  if (linked > 0) {
    console.log("\nSample of planned links:");
    for (const u of updates.slice(0, 15)) {
      console.log(`  cc ${u.id}  series ${u.series} #${u.issue}  ← "${u.title}"`);
    }
  }

  if (!APPLY) {
    console.log("\n(dry run — pass --apply to write)");
    return;
  }

  let ok = 0, err = 0;
  for (const u of updates) {
    const { error } = await sb
      .from("canonical_covers")
      .update({ series_gcd_id: u.series })
      .eq("id", u.id);
    if (error) { console.error("  fail", u.id, error.message); err++; } else ok++;
  }
  console.log(`\nApplied: ${ok}  Failed: ${err}`);
})();
