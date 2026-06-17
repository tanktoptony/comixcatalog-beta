// scripts/ingestStatus.js — real-time cover-ingest dashboard.
//
// Run anytime to see how the continuous ingest is doing — works whether
// the ingester is running on GHA, locally in PowerShell, or both. The
// numbers come from the database, so this is the truth even if the GHA
// log scrolled away or the laptop is off.
//
// Usage:
//   node scripts/ingestStatus.js              # one-shot snapshot
//   node scripts/ingestStatus.js --watch      # refresh every 30s
//   node scripts/ingestStatus.js --watch 60   # refresh every 60s

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function snapshot() {
  const now = new Date();

  // canonical_covers — total rows + recency. The since-1h delta is the
  // most useful live signal: if it's growing, the ingester is working.
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: total }, { count: lastHour }, { count: lastDay }, { count: seriesTotal }] =
    await Promise.all([
      supabase.from("canonical_covers").select("id", { count: "exact", head: true }),
      supabase
        .from("canonical_covers")
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneHourAgo),
      supabase
        .from("canonical_covers")
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
      supabase.from("series").select("id", { count: "exact", head: true }),
    ]);

  // Distinct series with at least one canonical cover. This is the
  // catalog-wide coverage number — climbs slower than raw row count
  // because new rows for already-covered series don't move it.
  //
  // PostgREST silently caps responses at 1000 rows regardless of .limit().
  // Page explicitly so canonical_covers's ~93k rows get fully scanned.
  const distinctSet = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from("canonical_covers")
      .select("series_title")
      .not("series_title", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!page || page.length === 0) break;
    for (const r of page) distinctSet.add(r.series_title);
    if (page.length < PAGE) break;
  }
  const distinctCovered = distinctSet.size;

  // Last 10 covers landed — visual confirmation the pipeline is alive
  // and a sanity check on what's coming through.
  const { data: recent } = await supabase
    .from("canonical_covers")
    .select("series_title, issue_number, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  console.clear();
  console.log("\n========== ComixCatalog cover-ingest status ==========");
  console.log(`Snapshot at: ${now.toLocaleString()}\n`);

  console.log(`canonical_covers (total):        ${(total ?? 0).toLocaleString()}`);
  console.log(`  added last 1h:                 ${(lastHour ?? 0).toLocaleString()}  ← live signal`);
  console.log(`  added last 24h:                ${(lastDay ?? 0).toLocaleString()}`);
  console.log();
  console.log(`series (total in catalog):       ${(seriesTotal ?? 0).toLocaleString()}`);
  console.log(`series with >=1 canonical cover: ${distinctCovered.toLocaleString()}  (${(
    (distinctCovered / (seriesTotal || 1)) *
    100
  ).toFixed(2)}%)`);
  console.log();
  console.log(`Most recent covers landed:`);
  for (const r of recent ?? []) {
    const age = Math.round((now - new Date(r.created_at)) / 1000);
    const ageStr = age < 60 ? `${age}s ago` : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`;
    const title = (r.series_title ?? "—").slice(0, 50).padEnd(50);
    const issue = `#${r.issue_number ?? "?"}`.padStart(6);
    console.log(`  ${title} ${issue}   ${ageStr}`);
  }
  console.log();

  if ((lastHour ?? 0) === 0) {
    console.log("⚠  No new covers in the last hour. Possible reasons:");
    console.log("   • Cron hasn't fired yet (runs every 6 hours)");
    console.log("   • Local PowerShell loop not running");
    console.log("   • COMICVINE_API_KEY missing in repo secrets");
    console.log("   • All gap-file targets are done — check gap-*.json size");
  } else {
    console.log("✓  Ingester is alive and writing.");
  }
  console.log();
}

const args = process.argv.slice(2);
const watchIdx = args.indexOf("--watch");
if (watchIdx === -1) {
  await snapshot();
  process.exit(0);
}

const intervalSec = Number(args[watchIdx + 1] ?? 30);
const intervalMs = Math.max(5, intervalSec) * 1000;

console.log(`Watching every ${intervalSec}s. Ctrl+C to exit.`);
await snapshot();
setInterval(() => {
  snapshot().catch((err) => console.error("snapshot failed:", err.message));
}, intervalMs);
