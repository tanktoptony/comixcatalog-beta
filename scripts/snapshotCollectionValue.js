// Snapshot every user's collection value into collection_value_history.
// Usage:
//   node scripts/snapshotCollectionValue.js
//   node scripts/snapshotCollectionValue.js --dry-run

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { loadCopyValues } from "./lib/collectionValues.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

async function run() {
  const copies = await loadCopyValues(supabase);
  const byUser = new Map();
  for (const copy of copies) {
    const entry = byUser.get(copy.user_id) ?? { totalValue: 0, ownedCount: 0, pricedCount: 0 };
    entry.totalValue += copy.value;
    entry.ownedCount += 1;
    if (copy.value > 0) entry.pricedCount += 1;
    byUser.set(copy.user_id, entry);
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const rowsToUpsert = [...byUser.entries()].map(([user_id, { totalValue, ownedCount, pricedCount }]) => ({
    user_id,
    snapshot_date: snapshotDate,
    total_value: roundCurrency(totalValue),
    owned_count: ownedCount,
    priced_count: pricedCount,
  }));

  console.log(`\nUsers with owned items: ${rowsToUpsert.length}`);
  console.log(`Site-wide total value (sum across all users): $${roundCurrency(rowsToUpsert.reduce((sum, row) => sum + row.total_value, 0)).toLocaleString()}`);
  console.log(`Snapshot date: ${snapshotDate}`);

  if (DRY_RUN) {
    console.log("\n[dry-run] Sample rows (first 10):");
    console.log(rowsToUpsert.slice(0, 10));
    console.log("\n[dry-run] No writes performed.");
    return;
  }
  if (rowsToUpsert.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  for (let from = 0; from < rowsToUpsert.length; from += 500) {
    const chunk = rowsToUpsert.slice(from, from + 500);
    const { error } = await supabase.from("collection_value_history").upsert(chunk, { onConflict: "user_id,snapshot_date" });
    if (error) throw error;
  }
  console.log("Done.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
