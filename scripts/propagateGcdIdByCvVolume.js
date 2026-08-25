// For each comicvine_volume_id, one ComicVine volume can end up with covers
// tagged to SEVERAL different series_gcd_id values across separate ingest
// runs — GCD frequently has multiple distinct series entries sharing the
// exact same title (foreign-language reprints, book-club editions, one-shot
// collections), and title-only resolution can land on a different one each
// run even though ComicVine's own volume match was correct and consistent
// every time. Live example found 2026-08-25: "Excalibur" (Marvel, 1988) —
// ComicVine volume 4052's 126 covers were correct throughout, but only 3
// ended up tagged to the real series (gcd_id 3648); the other 123 were
// split across FOUR unrelated GCD "Excalibur" entries (a 1989 Reader's
// Digest reprint, two Spanish-language editions, a 2022 Dutch one) or left
// untagged — all invisible on the real series page as a result.
//
// The original version of this script picked the anchor by raw majority
// vote per volume. That is actively dangerous: in the Excalibur case the
// WRONG series (the Reader's Digest one) had 56 mistagged covers versus
// only 3 correct, so majority vote would have picked the wrong anchor and
// made the corruption worse, not better, if ever run.
//
// This version instead scores each candidate gcd_id by issue_number
// OVERLAP against its real gcd_issues list — the correct series is the one
// whose actual issue numbers the volume's covers actually match, not
// whichever wrong tag happened to get repeated most. Only acts when the
// winner is unambiguous (clears a high overlap threshold with no close
// second) so an unresolvable volume is skipped and reported, never guessed.
//
// Usage:
//   node scripts/propagateGcdIdByCvVolume.js --dry-run   # report only
//   node scripts/propagateGcdIdByCvVolume.js             # apply

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes("--dry-run");
const OVERLAP_THRESHOLD = 0.85;
const MIN_MARGIN = 0.15; // winner must beat runner-up by this much to avoid guessing on a near-tie
const PAGE = 1000;

const norm = (value) => String(value ?? "").trim().toLowerCase();

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

console.log("Loading all covers with a comicvine_volume_id...");
const covers = await fetchAllPages(() =>
  supabase
    .from("canonical_covers")
    .select("id, comicvine_volume_id, series_gcd_id, issue_number")
    .not("comicvine_volume_id", "is", null)
    .not("storage_path", "is", null)
    .order("id")
);
console.log(`Covers loaded: ${covers.length}`);

const byVolume = new Map();
for (const c of covers) {
  const key = c.comicvine_volume_id;
  if (!byVolume.has(key)) byVolume.set(key, []);
  byVolume.get(key).push(c);
}

// Volumes worth resolving: more than one distinct series_gcd_id present
// (including NULL), i.e. there's actually something to fix.
const dirtyVolumes = [...byVolume.entries()].filter(([, rows]) => {
  const distinctTags = new Set(rows.map((r) => r.series_gcd_id ?? "NULL"));
  return distinctTags.size > 1;
});
console.log(`Volumes with a resolvable tag conflict: ${dirtyVolumes.length}`);

// Batch-fetch real issue_number sets for every candidate gcd_id across all
// dirty volumes, instead of one query per volume.
const candidateGcdIds = new Set();
for (const [, rows] of dirtyVolumes) {
  for (const r of rows) if (r.series_gcd_id != null) candidateGcdIds.add(r.series_gcd_id);
}
console.log(`Candidate series_gcd_id values to validate: ${candidateGcdIds.size}`);

const issueNumbersByGcdId = new Map();
const idList = [...candidateGcdIds];
for (let i = 0; i < idList.length; i += 500) {
  const chunk = idList.slice(i, i + 500);
  const { data, error } = await supabase
    .from("gcd_issues")
    .select("series_gcd_id, issue_number")
    .in("series_gcd_id", chunk);
  if (error) throw error;
  for (const row of data ?? []) {
    const key = row.series_gcd_id;
    if (!issueNumbersByGcdId.has(key)) issueNumbersByGcdId.set(key, new Set());
    issueNumbersByGcdId.get(key).add(norm(row.issue_number));
  }
}

let resolved = 0;
let skippedAmbiguous = 0;
let skippedNoValidCandidate = 0;
let totalRowsToUpdate = 0;
const plan = []; // { volume, winner, rowIds }

for (const [volume, rows] of dirtyVolumes) {
  const volumeIssueNumbers = new Set(rows.map((r) => norm(r.issue_number)));
  const candidates = [...new Set(rows.map((r) => r.series_gcd_id).filter((v) => v != null))];

  let best = null; // { gcdId, overlap }
  let second = null;
  for (const gcdId of candidates) {
    const realNumbers = issueNumbersByGcdId.get(gcdId);
    if (!realNumbers || realNumbers.size === 0) continue;
    let matched = 0;
    for (const n of volumeIssueNumbers) if (realNumbers.has(n)) matched++;
    const overlap = matched / volumeIssueNumbers.size;
    if (!best || overlap > best.overlap) {
      second = best;
      best = { gcdId, overlap };
    } else if (!second || overlap > second.overlap) {
      second = { gcdId, overlap };
    }
  }

  if (!best || best.overlap < OVERLAP_THRESHOLD) {
    skippedNoValidCandidate++;
    continue;
  }
  if (second && best.overlap - second.overlap < MIN_MARGIN) {
    skippedAmbiguous++;
    continue;
  }

  const rowsToFix = rows.filter((r) => r.series_gcd_id !== best.gcdId);
  if (rowsToFix.length === 0) continue;

  resolved++;
  totalRowsToUpdate += rowsToFix.length;
  plan.push({ volume, winner: best.gcdId, overlap: best.overlap, rowIds: rowsToFix.map((r) => r.id) });
}

console.log(`\nResolved (unambiguous winner): ${resolved} volumes, ${totalRowsToUpdate} rows to relink`);
console.log(`Skipped — no candidate cleared ${OVERLAP_THRESHOLD * 100}% overlap: ${skippedNoValidCandidate}`);
console.log(`Skipped — ambiguous (winner/runner-up within ${MIN_MARGIN * 100} points): ${skippedAmbiguous}`);

if (plan.length > 0) {
  console.log("\nSample of what will change:");
  for (const p of plan.slice(0, 10)) {
    console.log(`  volume ${p.volume} -> series_gcd_id ${p.winner} (overlap ${(p.overlap * 100).toFixed(0)}%), ${p.rowIds.length} row(s)`);
  }
}

if (DRY_RUN) {
  console.log("\n[dry-run] No writes performed.");
  process.exit(0);
}

console.log("\nApplying...");
let totalUpdated = 0;
for (const p of plan) {
  const { data, error } = await supabase
    .from("canonical_covers")
    .update({ series_gcd_id: p.winner })
    .in("id", p.rowIds)
    .select("id");
  if (error) {
    console.error(`volume=${p.volume} error:`, error.message);
    continue;
  }
  totalUpdated += data?.length ?? 0;
}
console.log(`\nDone. Rows updated: ${totalUpdated}`);
