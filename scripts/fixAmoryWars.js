// One-off catalog repair for reports/amory-wars/PLAN.md. Safe to rerun:
// dry-run is the default, and each write converges on the same explicit state.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { indexCanonicalIssues, issueFor } from "./lib/amoryWars.js";

dotenv.config({ path: ".env.local", quiet: true });

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;
const CHUNK = 200;

// Formats are not set here. GCD's API has the real publishing_format and
// binding for every one of these, so run
//   node scripts/syncGcdSeriesFormat.js --gcd-ids=<all of CANONICAL>
// after --apply instead of hand-labelling them.
const CANONICAL = [
  { gcdId: 26099, volumeId: 18858 },
  { gcdId: 52493, volumeId: 32728 },
  { gcdId: 49190, volumeId: 33409 },
  // GCD 56561 is the three In Keeping Secrets trade paperbacks, not a
  // duplicate of 49190. It was pinned to 33409 (the single issues), which
  // is how the 12 single-issue covers ended up on the TPB series and the
  // real 12-issue run showed none. It keeps its row, loses the pin.
  { gcdId: 56561, volumeId: null },
  { gcdId: 144356, volumeId: 24728 },
  { gcdId: 144355, volumeId: 41701 },
  { gcdId: 51788, volumeId: 101236 },
  { gcdId: 113303, volumeId: 100558 },
  { gcdId: 118620, volumeId: 106107 },
  { gcdId: 123461, volumeId: null },
  { gcdId: 211950, volumeId: 158085 },
  { gcdId: 219105, volumeId: 169675 },
  { gcdId: 220455, volumeId: null },
];

const AMORY_GCD_IDS = new Set(CANONICAL.map((row) => row.gcdId));

const MANUAL_TO_GCD = new Map([
  ["dbe47757-c9bb-40e6-9b06-568c24bf454a", 26099],
  ["72ed6ae9-af63-4cfb-aaec-98611daaad34", 52493],
  ["acf15cbf-10be-483b-af8f-12c31b723e4d", 144356],
  ["d42c9659-c788-4108-9029-293296c28f0e", 113303],
  ["9a68569b-98ec-4ac9-8271-1edd1f9e60e0", 211950],
  ["73b68ac3-0157-428e-822a-fe76187446d5", 211950],
  ["f11b46cb-67db-402c-a1f4-5eb95a42b244", 211950],
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function fail(label, error) {
  throw new Error(`${label}: ${error?.code ?? "unknown"} | ${error?.message ?? error}`);
}

async function paged(label, build, order = "id") {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order(order).range(from, from + PAGE - 1);
    if (error) fail(label, error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function updateOne(table, values, column, value, label) {
  if (!APPLY) return;
  const { error } = await supabase.from(table).update(values).eq(column, value);
  if (error) fail(label, error);
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  console.log(`Amory Wars repair (${APPLY ? "APPLY" : "dry run"})`);

  const canonicalSeries = await paged("canonical series", () =>
    supabase.from("series").select("id,gcd_id,title,comicvine_volume_id,us_market,featured_cover_path_cached")
      .in("gcd_id", [...AMORY_GCD_IDS])
  );
  const manualSeries = await paged("manual series", () =>
    supabase.from("series").select("id,gcd_id,title,comicvine_volume_id,us_market,featured_cover_path_cached")
      .in("id", [...MANUAL_TO_GCD.keys()])
  );
  const series = [...canonicalSeries, ...manualSeries];
  const seriesByGcd = new Map(series.filter((row) => row.gcd_id != null).map((row) => [Number(row.gcd_id), row]));
  for (const wanted of CANONICAL) {
    if (!seriesByGcd.has(wanted.gcdId)) throw new Error(`missing canonical series row for GCD ${wanted.gcdId}`);
  }

  const issues = await paged("gcd_issues", () =>
    supabase.from("gcd_issues").select("gcd_id,series_gcd_id,issue_number").in("series_gcd_id", [...AMORY_GCD_IDS]),
    "gcd_id"
  );
  const issueIndex = indexCanonicalIssues(issues);

  const comics = await paged("comics", () =>
    supabase.from("comics").select("id,series_id,issue_number,gcd_id,series_title").in("series_id", [...MANUAL_TO_GCD.keys()])
  );

  console.log("\nComics to canonical series:");
  for (const comic of comics) {
    const targetGcdId = MANUAL_TO_GCD.get(comic.series_id);
    const targetSeries = seriesByGcd.get(targetGcdId);
    const targetIssue = issueFor(issueIndex, targetGcdId, comic.issue_number);
    if (!targetIssue) throw new Error(`no GCD issue for comic ${comic.id}, GCD series ${targetGcdId}, issue ${comic.issue_number}`);
    const values = { series_id: targetSeries.id, series_title: targetSeries.title, gcd_id: Number(targetIssue.gcd_id) };
    console.log(`  ${comic.id}: ${comic.series_id} -> ${targetSeries.id}; gcd ${comic.gcd_id ?? "null"} -> ${values.gcd_id}`);
    await updateOne("comics", values, "id", comic.id, `update comic ${comic.id}`);
  }

  const allPins = await paged("series pins", () =>
    supabase.from("series").select("id,gcd_id,title,comicvine_volume_id").not("comicvine_volume_id", "is", null)
  );
  console.log("\nCanonical pins and formats:");
  for (const wanted of CANONICAL) {
    const row = seriesByGcd.get(wanted.gcdId);
    if (wanted.volumeId != null) {
      const conflicts = allPins.filter((other) =>
        Number(other.comicvine_volume_id) === wanted.volumeId &&
        other.id !== row.id &&
        !AMORY_GCD_IDS.has(Number(other.gcd_id))
      );
      if (conflicts.length) {
        throw new Error(`refusing ComicVine ${wanted.volumeId} for GCD ${wanted.gcdId}; held by non-Amory ${conflicts.map((c) => `${c.title} (${c.gcd_id ?? c.id})`).join(", ")}`);
      }
    }
    console.log(`  GCD ${wanted.gcdId}: volume ${row.comicvine_volume_id ?? "none"} -> ${wanted.volumeId ?? "none"}; visible`);
    await updateOne(
      "series",
      // featured cover cleared so the cache refresh re-picks it from the
      // corrected attribution instead of keeping a cover from the old pin.
      { comicvine_volume_id: wanted.volumeId, us_market: true, featured_cover_path_cached: null, search_refreshed_at: null },
      "id",
      row.id,
      `series GCD ${wanted.gcdId}`
    );
  }


  const relevantVolumes = CANONICAL.map((row) => row.volumeId).filter(Boolean);
  const covers = await paged("canonical_covers", () =>
    supabase.from("canonical_covers")
      .select("id,series_gcd_id,comicvine_volume_id,issue_number,gcd_issue_id")
      .in("comicvine_volume_id", relevantVolumes)
  );
  const ownerByVolume = new Map(CANONICAL.filter((row) => row.volumeId).map((row) => [row.volumeId, row.gcdId]));
  console.log("\nCover attribution:");
  for (const cover of covers) {
    const owner = ownerByVolume.get(Number(cover.comicvine_volume_id));
    const targetIssue = issueFor(issueIndex, owner, cover.issue_number);
    const values = { series_gcd_id: owner, gcd_issue_id: targetIssue ? Number(targetIssue.gcd_id) : null };
    if (Number(cover.series_gcd_id) === owner && Number(cover.gcd_issue_id) === values.gcd_issue_id) continue;
    console.log(`  cover ${cover.id}: series ${cover.series_gcd_id ?? "null"} -> ${owner}; issue ${cover.gcd_issue_id ?? "null"} -> ${values.gcd_issue_id ?? "null"}`);
    await updateOne("canonical_covers", values, "id", cover.id, `cover ${cover.id}`);
  }

  console.log("\nManual duplicate deletion checks:");
  for (const manualId of MANUAL_TO_GCD.keys()) {
    const remainingComics = await paged(`remaining comics ${manualId}`, () =>
      supabase.from("comics").select("id").eq("series_id", manualId)
    );
    const manual = series.find((row) => row.id === manualId);
    if (!manual) continue;
    if (manual.gcd_id != null) throw new Error(`refusing to delete non-manual series ${manualId}`);
    if (remainingComics.length && APPLY) throw new Error(`refusing to delete ${manualId}; ${remainingComics.length} comics still reference it`);
    const plannedRemaining = APPLY ? remainingComics.length : remainingComics.filter((row) => !comics.some((comic) => comic.id === row.id)).length;
    if (plannedRemaining) {
      console.log(`  KEEP ${manualId} ${manual.title}: ${plannedRemaining} comics remain`);
      continue;
    }
    console.log(`  DELETE ${manualId} ${manual.title}: no references after repoint`);
    if (!APPLY) continue;
    const { error } = await supabase.from("series").delete().eq("id", manualId).is("gcd_id", null);
    if (error) fail(`delete manual series ${manualId}`, error);
  }

  console.log(APPLY ? "\nRepair applied." : "\nDry run only. Re-run with --apply to write.");
}

main().catch((error) => {
  console.error(`fixAmoryWars failed: ${error.message}`);
  process.exit(1);
});
