// Find `series` rows that are collected editions (per gcd_series
// publishing_format, migration 0028 + syncGcdSeriesFormat.js) but are pinned
// to a ComicVine volume that another, non-collected series row also claims.
// That pin is how the Fables trade-paperback series showed the monthly's
// cover and "161 issues" in search (2026-09-21): the TPB row was pinned to
// the monthly's volume 9723.
//
// For each such row: clear comicvine_volume_id and featured_cover_path_cached,
// and set issue_count_cached to the row's own deduped gcd_issues count so it
// ranks honestly. Nothing is deleted. Rows whose pin is NOT shared are left
// alone: ComicVine does have real collected-edition volumes, and an
// unshared pin may well be one.
//
//   node scripts/unpinCollectedEditions.js            # dry run, prints plan
//   node scripts/unpinCollectedEditions.js --apply    # writes

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";
import { isCollectedEdition } from "../src/lib/seriesFormat.js";

dotenv.config({ path: ".env.local", quiet: true });
const APPLY = process.argv.includes("--apply");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function keyset(build, keyCol = "id") {
  const rows = [];
  let last = null;
  for (;;) {
    let q = build().order(keyCol).limit(1000);
    if (last != null) q = q.gt(keyCol, last);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    last = data[data.length - 1][keyCol];
  }
  return rows;
}

async function run() {
  const pinned = await keyset(() =>
    supabase.from("series").select("id, title, gcd_id, comicvine_volume_id, issue_count_cached, featured_cover_path_cached")
      .not("comicvine_volume_id", "is", null).not("gcd_id", "is", null)
  );
  const byVol = new Map();
  for (const r of pinned) {
    if (!byVol.has(r.comicvine_volume_id)) byVol.set(r.comicvine_volume_id, []);
    byVol.get(r.comicvine_volume_id).push(r);
  }
  const shared = [...byVol.values()].filter((g) => g.length > 1);
  const sharedRows = shared.flat();
  console.log(`${pinned.length} pinned series rows; ${shared.length} volumes pinned by more than one row (${sharedRows.length} rows).`);

  // Format for every row in a shared group.
  const gcdIds = [...new Set(sharedRows.map((r) => r.gcd_id))];
  const format = new Map();
  for (let i = 0; i < gcdIds.length; i += 500) {
    const { data, error } = await supabase.from("gcd_series").select("gcd_id, publishing_format, binding, format_synced_at").in("gcd_id", gcdIds.slice(i, i + 500));
    if (error) {
      if (/publishing_format|format_synced_at/.test(error.message)) {
        console.error("gcd_series has no format columns yet. Apply scripts/migrations/0028_gcd_series_format.sql first.");
        process.exit(1);
      }
      throw error;
    }
    for (const row of data ?? []) format.set(row.gcd_id, row);
  }
  const synced = gcdIds.filter((id) => format.get(id)?.format_synced_at).length;
  console.log(`Format known for ${synced} of ${gcdIds.length} gcd_series in those groups (run syncGcdSeriesFormat.js --source=shared-pins for the rest).`);

  const plan = [];
  for (const group of shared) {
    const collected = group.filter((r) => isCollectedEdition(format.get(r.gcd_id) ?? {}));
    const notCollected = group.filter((r) => !isCollectedEdition(format.get(r.gcd_id) ?? {}));
    // Only unpin when a non-collected sibling keeps the volume. If every row
    // in the group is collected (or unknown), there is nothing to hand the
    // pin to and we leave it for a human.
    if (!collected.length || !notCollected.length) continue;
    for (const r of collected) plan.push({ row: r, keeper: notCollected[0] });
  }
  console.log(`\n${plan.length} collected-edition rows to unpin${APPLY ? "" : " (dry run)"}:`);

  let applied = 0;
  for (const { row, keeper } of plan) {
    const { data: issues } = await supabase.from("gcd_issues").select("issue_number").eq("series_gcd_id", row.gcd_id).limit(1000);
    const count = new Set((issues ?? []).map((i) => baseIssueNumber(i.issue_number)).filter((x) => x != null)).size;
    console.log(`  ${row.title} (gcd ${row.gcd_id}) vol ${row.comicvine_volume_id} -> unpin; issue_count ${row.issue_count_cached} -> ${count}; volume stays with gcd ${keeper.gcd_id}`);
    if (!APPLY) continue;
    const { error } = await supabase.from("series")
      .update({ comicvine_volume_id: null, featured_cover_path_cached: null, issue_count_cached: count })
      .eq("id", row.id).eq("comicvine_volume_id", row.comicvine_volume_id);
    if (error) { console.error(`    write failed: ${error.message}`); continue; }
    applied += 1;
  }
  console.log(APPLY ? `\nUnpinned ${applied}.` : "\nDry run only. Re-run with --apply to write.");
}

run().catch((err) => { console.error(err); process.exit(1); });
