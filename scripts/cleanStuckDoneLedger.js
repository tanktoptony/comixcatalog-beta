// Backward cleanup for .ingest-done.json: removes entries that were marked
// done under the old "loop completed without crashing" rule but actually
// have zero real covers despite having real issues. Confirmed 2026-08-09:
// 5/40 randomly sampled done-ledger entries were exactly this pattern
// (Beetle Bailey, Deadpool 2021, Junk Rabbit, etc. - marked done, 0 covers).
//
// Scoped narrowly to true zero-coverage cases, not partial ones - partial
// coverage is often a legitimate ComicVine data ceiling (not every historic
// issue has cover art available), not a bug. Removing those from the ledger
// would just burn search budget re-confirming a real limitation. Zero
// coverage despite real issues existing is the unambiguous "actually stuck"
// signal this script targets.
//
// Usage:
//   node scripts/cleanStuckDoneLedger.js [--dry-run] [--done-file=.ingest-done.json]

import fs from "node:fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const DRY_RUN = Boolean(args["dry-run"]);
const DONE_FILE = args["done-file"] ?? ".ingest-done.json";

const PAGE = 1000;
async function page(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const done = JSON.parse(fs.readFileSync(DONE_FILE, "utf8"));
const entries = Object.entries(done).map(([raw, ts]) => {
  const [name, publisher, year] = raw.split("\x01");
  return { raw, ts, name, publisher, year: Number(year) };
});
console.log(`Loaded ${entries.length} done-ledger entries from ${DONE_FILE}`);

const uniqueNames = [...new Set(entries.map((e) => e.name))];
console.log(`Resolving ${uniqueNames.length} unique names against gcd_series...`);

const gcdSeriesRows = [];
for (let i = 0; i < uniqueNames.length; i += 200) {
  const chunk = uniqueNames.slice(i, i + 200);
  const rows = await page(() => supabase.from("gcd_series").select("gcd_id,name,year_began").in("name", chunk));
  gcdSeriesRows.push(...rows);
}
const byName = new Map();
for (const r of gcdSeriesRows) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r);
}

const resolved = [];
for (const e of entries) {
  const candidates = byName.get(e.name) ?? [];
  if (candidates.length === 0) continue;
  const best = candidates.find((c) => Math.abs((c.year_began ?? -9999) - e.year) <= 1) ?? candidates[0];
  resolved.push({ ...e, gcd_id: best.gcd_id });
}
console.log(`Resolved ${resolved.length} / ${entries.length} entries to a gcd_id.`);

const resolvedIds = [...new Set(resolved.map((r) => r.gcd_id))];
console.log(`Fetching gcd_issues + canonical_covers counts for ${resolvedIds.length} distinct series...`);

const issueCountByGcdId = new Map();
for (let i = 0; i < resolvedIds.length; i += 200) {
  const chunk = resolvedIds.slice(i, i + 200);
  const rows = await page(() => supabase.from("gcd_issues").select("series_gcd_id").in("series_gcd_id", chunk));
  for (const r of rows) issueCountByGcdId.set(r.series_gcd_id, (issueCountByGcdId.get(r.series_gcd_id) ?? 0) + 1);
}

const coverCountByGcdId = new Map();
for (let i = 0; i < resolvedIds.length; i += 200) {
  const chunk = resolvedIds.slice(i, i + 200);
  const rows = await page(() => supabase.from("canonical_covers").select("series_gcd_id").in("series_gcd_id", chunk).not("storage_path", "is", null));
  for (const r of rows) coverCountByGcdId.set(r.series_gcd_id, (coverCountByGcdId.get(r.series_gcd_id) ?? 0) + 1);
}

// series_gcd_id linkage fails whenever the write-side GCD match comes back
// unresolved (confirmed common today - e.g. every issue of today's live
// Batman/Deadpool/Aquaman/etc batch matched with confidence=unresolved).
// Those covers still exist, just keyed by series_title with series_gcd_id
// null - the same fallback path /api/series/[id]/route.js already uses.
// Checking series_gcd_id alone would flag real, covered series as stuck.
const titlesNeedingCheck = [...new Set(resolved
  .filter((r) => (coverCountByGcdId.get(r.gcd_id) ?? 0) === 0)
  .map((r) => r.name))];
const coveredByTitle = new Set();
for (let i = 0; i < titlesNeedingCheck.length; i += 200) {
  const chunk = titlesNeedingCheck.slice(i, i + 200);
  const rows = await page(() => supabase.from("canonical_covers").select("series_title").in("series_title", chunk).is("series_gcd_id", null).not("storage_path", "is", null));
  for (const r of rows) coveredByTitle.add(r.series_title);
}

const stuck = [];
for (const r of resolved) {
  const issueCount = issueCountByGcdId.get(r.gcd_id) ?? 0;
  const coverCount = coverCountByGcdId.get(r.gcd_id) ?? 0;
  if (issueCount > 0 && coverCount === 0 && !coveredByTitle.has(r.name)) {
    stuck.push({ ...r, issueCount, coverCount });
  }
}

console.log(`\nFound ${stuck.length} STUCK entries (real issues, zero covers) out of ${resolved.length} resolved:`);
for (const s of stuck.slice(0, 30)) {
  console.log(`  ${s.name} (${s.publisher}, ${s.year}) — gcd_id=${s.gcd_id}, ${s.issueCount} issues, 0 covers`);
}
if (stuck.length > 30) console.log(`  ... and ${stuck.length - 30} more`);

if (DRY_RUN) {
  console.log(`\n[dry-run] Would remove ${stuck.length} entries from ${DONE_FILE}. Re-run without --dry-run to apply.`);
  process.exit(0);
}

const stuckKeys = new Set(stuck.map((s) => s.raw));
const cleaned = Object.fromEntries(Object.entries(done).filter(([k]) => !stuckKeys.has(k)));
fs.writeFileSync(DONE_FILE, JSON.stringify(cleaned, null, 2) + "\n");
console.log(`\nRemoved ${stuck.length} stuck entries. ${DONE_FILE}: ${entries.length} -> ${Object.keys(cleaned).length} entries.`);
console.log(`These will be retried on the next cover-ingest run instead of staying silently stuck.`);
