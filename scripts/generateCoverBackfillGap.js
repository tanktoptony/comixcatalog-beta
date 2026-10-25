// generateCoverBackfillGap.js
//
// Writes gap-backfill.json: US series that still have no cover at all, in
// the order the cover-ingest backfill lane should try them. Mainstream
// publishers first, newest first, released books before announced ones.
// The selection lives in public.cover_backfill_candidates() (migration 0091).
//
// Why (2026-10-25): the width lane keeps the 5,000 smallest series, and there
// are more one-issue series than that, so nothing with two or more issues was
// ever queued. 33,701 numbered series and 41,887 single-book series (trades,
// graphic novels, one-shots) had no cover and sat in no queue.
//
// Each target carries its GCD series id (series_gcd_id), so covers land on
// the right series, and on single-book series the ingester links the one
// ComicVine issue to the one GCD book.
//
// Usage:
//   node scripts/generateCoverBackfillGap.js              # dry run, prints a preview
//   node scripts/generateCoverBackfillGap.js --apply      # writes gap-backfill.json
//   node scripts/generateCoverBackfillGap.js --limit=500

import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { describeError } from "./lib/describeError.js";
import { withRetry } from "./lib/withRetry.js";

dotenv.config({ path: ".env.local" });

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=");
  return [key, value ?? true];
}));
const LIMIT = Number(args.limit ?? 3000);
const OUT_PATH = "gap-backfill.json";
const PAGE = 1000;

const TIER1 = ["Marvel Comics", "DC Comics", "Image Comics"];
const TIER2 = [
  "Dark Horse Comics", "IDW Publishing", "BOOM! Studios", "Dynamite Entertainment",
  "Valiant Comics", "Oni Press", "Titan Comics", "Vertigo", "AfterShock Comics",
  "Mad Cave Studios", "AHOY Comics", "Archie Comics", "Aspen Comics",
  "Top Cow Productions", "WildStorm", "Skybound", "Vault Comics", "Fantagraphics",
  "Avatar Press", "Zenescope Entertainment", "Antarctic Press", "Malibu Comics",
  "Eclipse Comics", "First Comics",
];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("\n=== generateCoverBackfillGap ===\n");
  // PostgREST caps an RPC result at 1,000 rows like any other read; page it.
  const rows = [];
  for (let from = 0; from < LIMIT; from += PAGE) {
    const page = await withRetry(`cover_backfill_candidates ${from}`, () => supabase
      .rpc("cover_backfill_candidates", { tier1: TIER1, tier2: TIER2, result_limit: LIMIT })
      .range(from, Math.min(from + PAGE, LIMIT) - 1));
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const targets = rows.map((row) => ({
    name: row.title,
    publisher: row.publisher,
    year: row.year_start,
    volume_id: row.comicvine_volume_id ?? null,
    series_gcd_id: Number(row.gcd_id),
  }));
  console.log(`${targets.length} uncovered series (limit ${LIMIT}).`);
  for (const target of targets.slice(0, 10)) {
    console.log(`  ${target.publisher} (${target.year ?? "?"}) ${target.name}`);
  }
  if (!args.apply) {
    console.log("\nDry run. Pass --apply to write gap-backfill.json.");
    return;
  }
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(targets, null, 2)}\n`, "utf-8");
  console.log(`\nWrote ${OUT_PATH} (${targets.length}).`);
}

main().catch((error) => {
  console.error("generateCoverBackfillGap failed:", describeError(error));
  process.exit(1);
});
