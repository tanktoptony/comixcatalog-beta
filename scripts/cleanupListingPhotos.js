// Nightly cleanup for seller listing photos (rules: scripts/lib/photoCleanupPlan.js).
//
//   node scripts/cleanupListingPhotos.js           # dry run: report only
//   node scripts/cleanupListingPhotos.js --apply   # delete
//   --as-of=2026-10-05T00:00:00Z                  # judge ages as of another time (testing)
//
// Storage is the plan limit we already hit once (150 GB on 100 GB), so
// nothing gets to pile up: unprocessed originals after 24h, and public
// photo files no row points to (a deleted collection row cascades its
// listing_photos rows but not the files).

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { planCleanup } from "./lib/photoCleanupPlan.js";

dotenv.config({ path: ".env.local", quiet: true });
const APPLY = process.argv.includes("--apply");
const asOfArg = process.argv.find((a) => a.startsWith("--as-of="));
const NOW = asOfArg ? Date.parse(asOfArg.slice("--as-of=".length)) : Date.now();
if (!Number.isFinite(NOW)) throw new Error("--as-of needs an ISO date");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Every file under a prefix, recursing into folders (folders have no id).
async function listAll(bucket, prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const e of data ?? []) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id == null) out.push(...(await listAll(bucket, path)));
      else out.push({ path, createdAt: e.created_at });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function referencedPaths() {
  const set = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("listing_photos").select("id, storage_path, thumb_path").order("id").range(from, from + 999);
    if (error) throw new Error(`listing_photos: ${error.message}`);
    for (const r of data ?? []) {
      set.add(r.storage_path);
      set.add(r.thumb_path);
    }
    if (!data || data.length < 1000) break;
  }
  return set;
}

async function remove(bucket, paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await sb.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
  }
}

const [originals, publicFiles, referenced] = await Promise.all([
  listAll("listing-photo-originals", "o"),
  listAll("listing-photos", "l"),
  referencedPaths(),
]);
const plan = planCleanup({ originals, publicFiles, referenced, now: NOW });
console.log(
  `originals: ${originals.length} total, ${plan.originals.length} stale | public files: ${publicFiles.length} total, ` +
    `${referenced.size} referenced, ${plan.orphans.length} orphaned`
);
for (const p of [...plan.originals, ...plan.orphans].slice(0, 20)) console.log(`  ${APPLY ? "delete" : "would delete"} ${p}`);

if (APPLY) {
  await remove("listing-photo-originals", plan.originals);
  await remove("listing-photos", plan.orphans);
  console.log(`deleted ${plan.originals.length} originals and ${plan.orphans.length} orphaned files`);
} else {
  console.log("dry run: pass --apply to delete");
}
