// scripts/generateUserGap.js
//
// For a specific user, find every series they own that has at least one
// issue lacking a canonical cover. Writes those series (with year +
// publisher) to gap-<username>.json so the resolver + ingester pipeline
// can fill them.
//
// Why "at least one missing" rather than "no canonical at all": a series
// can have covers for issues #1-50 but not #75. We still want to ingest
// — most likely the volume's later issues just weren't fetched on a
// prior run. Letting the ingester re-walk the volume with --skip-existing
// fills the gaps without re-uploading what we already have.
//
// Usage:
//   node scripts/generateUserGap.js <username>
//   node scripts/generateUserGap.js cc_admin
//   node scripts/generateUserGap.js treystyles --out=gap-treystyles.json
//
// Then:
//   node scripts/resolveVolumeIds.js gap-cc-admin.json
//   python comicvine_api_to_supabase.py --targets gap-cc-admin.json --skip-existing --ignore-done

import dotenv from "dotenv";
import path from "path";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
);

const username = positional[0];
if (!username) {
  console.error("Usage: node scripts/generateUserGap.js <username>");
  process.exit(1);
}

const outFile = flags.out ?? `gap-${username.replace(/[^a-z0-9_-]/gi, "_")}.json`;

console.log(`\n=== generateUserGap: ${username} ===\n`);

// 1. Get user.
const { data: profile, error: profileErr } = await supabase
  .from("profiles")
  .select("id, username")
  .eq("username", username)
  .single();
if (profileErr || !profile) {
  console.error(`User "${username}" not found.`);
  process.exit(1);
}

// 2. Get collection (gcd-linked items only — local comics don't have a
//    canonical to compare against).
const { data: items } = await supabase
  .from("user_collections")
  .select("id, gcd_issue_id")
  .eq("user_id", profile.id);
const gcdIds = (items ?? []).map((i) => i.gcd_issue_id).filter(Boolean);
console.log(`owned gcd-linked issues: ${gcdIds.length}`);

if (gcdIds.length === 0) {
  console.log("Nothing to do — user has no GCD-linked items.");
  process.exit(0);
}

// 3. Look up each issue's series + canonical cover status.
const { data: issues } = await supabase
  .from("gcd_issues")
  .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
  .in("gcd_id", gcdIds);

const seriesGcdIds = [...new Set((issues ?? []).map((i) => i.series_gcd_id).filter(Boolean))];
console.log(`distinct series:        ${seriesGcdIds.length}`);

const { data: seriesRows } = await supabase
  .from("series")
  .select("gcd_id, title, year_start_cached, resolved_publisher_cached")
  .in("gcd_id", seriesGcdIds);

const seriesById = Object.fromEntries((seriesRows ?? []).map((r) => [r.gcd_id, r]));

// 4. For each (series_gcd_id, issue_number) figure out whether a canonical
//    cover exists. Use ID path first (post-migration-0009 + backfill), then
//    title path as fallback.
const PAGE = 1000;
async function fetchAllPages(buildQuery) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const idCovers = seriesGcdIds.length
  ? await fetchAllPages(() =>
      supabase
        .from("canonical_covers")
        .select("series_gcd_id, issue_number")
        .in("series_gcd_id", seriesGcdIds)
        .not("storage_path", "is", null)
        .order("id")
    )
  : [];

const seriesTitles = [...new Set(Object.values(seriesById).map((s) => s.title).filter(Boolean))];
const titleCovers = seriesTitles.length
  ? await fetchAllPages(() =>
      supabase
        .from("canonical_covers")
        .select("series_title, issue_number")
        .in("series_title", seriesTitles)
        .not("storage_path", "is", null)
        .order("id")
    )
  : [];

function norm(v) { return String(v ?? "").trim().toLowerCase(); }
const haveCoverIdKey = new Set(idCovers.map((c) => `${c.series_gcd_id}::${norm(c.issue_number)}`));
const haveCoverTitleKey = new Set(titleCovers.map((c) => `${norm(c.series_title)}::${norm(c.issue_number)}`));

// 5. Mark series as "needs work" if ANY of their issues lacks a canonical.
const seriesNeedingWork = new Map();
for (const issue of issues ?? []) {
  const series = seriesById[issue.series_gcd_id];
  if (!series) continue;
  const idKey = `${issue.series_gcd_id}::${norm(issue.issue_number)}`;
  const titleKey = `${norm(series.title)}::${norm(issue.issue_number)}`;
  const hasCover = haveCoverIdKey.has(idKey) || haveCoverTitleKey.has(titleKey);
  if (!hasCover) {
    if (!seriesNeedingWork.has(series.gcd_id)) {
      seriesNeedingWork.set(series.gcd_id, {
        name: series.title,
        publisher: series.resolved_publisher_cached || "Unknown",
        year: series.year_start_cached ?? null,
        missing_issues: [],
      });
    }
    seriesNeedingWork.get(series.gcd_id).missing_issues.push(issue.issue_number);
  }
}

const targets = [...seriesNeedingWork.values()]
  .map((t) => ({
    name: t.name,
    publisher: t.publisher,
    year: t.year,
  }))
  .filter((t) => t.year != null);

console.log(`series with at least one uncovered issue: ${seriesNeedingWork.size}`);
console.log(`writable to gap file (have a known year):  ${targets.length}`);

const outPath = path.resolve(outFile);
writeFileSync(outPath, JSON.stringify(targets, null, 2) + "\n");
console.log(`\nWrote ${targets.length} target(s) → ${outPath}\n`);

if (targets.length > 0) {
  console.log("Next steps:");
  console.log(`  node scripts/resolveVolumeIds.js ${outFile}`);
  console.log(`  python comicvine_api_to_supabase.py --targets ${outFile} --skip-existing --ignore-done`);
}
