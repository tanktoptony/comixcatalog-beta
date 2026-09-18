// One-off follow-up to repairSeriesPublishersWithCv.js.
//
// Background: repairSeriesPublishersWithCv.js recomputes resolved_publisher_cached
// from LIVE cv_publisher/indicia candidates, not from the existing cached string
// itself. For a chunk of pre-2000 Malibu/Chaos! rows, that recompute finds no new
// candidate (indicia lookup returns nothing usable) and explicitly keeps the old
// cached value — even though the old cached value is one of the exact raw strings
// that src/lib/publisher.js's normalizePublisherLabel() now maps to "Malibu Comics"
// / "Chaos! Comics" as part of the Malibu/Chaos! allowlist fix.
//
// Rather than reimplement that mapping, this reuses normalizePublisherLabel()
// directly against the small, known, already-confirmed set of raw strings still
// sitting in resolved_publisher_cached. It only ever moves a row from one of
// those exact non-canonical raw strings to the matching canonical allowlist
// value — never a blind/general bulk update.
//
// Usage:
//   node scripts/normalizeMalibuChaosRemainder.js          # dry-run
//   node scripts/normalizeMalibuChaosRemainder.js --apply  # writes updates

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { normalizePublisherLabel } from "../src/lib/publisher.js";

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Exact raw strings confirmed live in resolved_publisher_cached that don't
// yet equal their normalized target.
const TARGET_RAW_VALUES = [
  "Malibu Comics Entertainment Inc.",
  "Malibu Graphics Inc.",
  "Malibu Graphics Inc",
  "Malibu Graphics Publishing Group",
  "Malibu",
  "Chaos! Comics and Gareb Shamus Enterprises Inc. DBA Wizard Press",
];

async function run() {
  console.log(APPLY ? "MODE: --apply (writes will happen)" : "MODE: dry-run");

  const { data, error } = await supabase
    .from("series")
    .select("id, title, resolved_publisher_cached")
    .in("resolved_publisher_cached", TARGET_RAW_VALUES);
  if (error) throw error;

  console.log(`Found ${data.length} rows with a stale raw value.`);

  const plan = [];
  for (const row of data) {
    const normalized = normalizePublisherLabel(row.resolved_publisher_cached);
    if (!normalized || normalized === row.resolved_publisher_cached) continue;
    plan.push({ id: row.id, title: row.title, from: row.resolved_publisher_cached, to: normalized });
  }

  const buckets = new Map();
  for (const p of plan) {
    const key = `${p.from} → ${p.to}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  console.log(`\n${plan.length} rows would change:`);
  for (const [key, count] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${key}`);
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write.");
    return;
  }

  console.log("\nApplying updates…");
  let applied = 0;
  for (let i = 0; i < plan.length; i += 200) {
    const batch = plan.slice(i, i + 200);
    await Promise.all(
      batch.map((p) =>
        supabase
          .from("series")
          .update({
            resolved_publisher_cached: p.to,
            search_refreshed_at: new Date().toISOString(),
          })
          .eq("id", p.id)
      )
    );
    applied += batch.length;
    process.stdout.write(`  applied ${applied}/${plan.length}\r`);
  }
  console.log("");
  console.log(`Updated ${applied} rows.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
