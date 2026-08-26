// One-off cleanup, 2026-08-26: removes the deprecated "manually typed +
// uploaded photo, no canonical link" entries for cb_ and cc_admin — the two
// accounts used tonight as test cases for a photo-based comic-identification
// idea. OCR against their real photos came back at 30-41% confidence with
// unusable extracted text (stylized comic-logo lettering defeats plain text
// OCR), so rather than let this old, unmatchable data linger, we're
// removing it and revisiting the identification problem later.
//
// Two tiers, because some of cc_admin's contributed comics rows turned out
// to be referenced by OTHER users too (they found cc_admin's manually-added
// comic via search and added it to their own collection):
//   - UNSHARED (22 items: 9 cb_, 13 cc_admin): full removal — comics row,
//     comic_covers row, the storage file itself, and the user_collections
//     row.
//   - SHARED (21 items: 3 cb_, 18 cc_admin): delist ONLY — delete the
//     owning user's own user_collections row, leave comics/comic_covers/
//     storage intact since a real, uninvolved third party still has it in
//     their own library.
//
// Usage: node scripts/purgeOldPhotoUploads_cb_ccadmin_2026-08-26.js [--dry-run]

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes("--dry-run");

const USER_IDS = {
  cb_: "10c96c1c-ba04-4504-b89b-83eb8801cfdd",
  cc_admin: "9ec650a2-8870-4175-82da-99d72cab9efc",
};

async function run() {
  const { data: manualRows } = await supabase
    .from("user_collections")
    .select("id, user_id, comic_id")
    .in("user_id", Object.values(USER_IDS))
    .not("comic_id", "is", null);

  const comicIds = manualRows.map((r) => r.comic_id);
  const { data: covers } = await supabase.from("comic_covers").select("comic_id, image_path").in("comic_id", comicIds);
  const coverByComicId = new Map(covers.map((c) => [c.comic_id, c.image_path]));
  const photographedRows = manualRows.filter((r) => coverByComicId.has(r.comic_id));

  const { data: allRefs } = await supabase
    .from("user_collections")
    .select("comic_id, user_id")
    .in("comic_id", photographedRows.map((r) => r.comic_id));
  const usersByComicId = new Map();
  for (const r of allRefs) {
    if (!usersByComicId.has(r.comic_id)) usersByComicId.set(r.comic_id, new Set());
    usersByComicId.get(r.comic_id).add(r.user_id);
  }

  const unshared = photographedRows.filter((r) => [...usersByComicId.get(r.comic_id)].every((u) => u === r.user_id));
  const shared = photographedRows.filter((r) => ![...usersByComicId.get(r.comic_id)].every((u) => u === r.user_id));

  console.log(`Unshared (full delete): ${unshared.length}`);
  console.log(`Shared with other users (delist only): ${shared.length}`);

  if (DRY_RUN) {
    console.log("\n[dry-run] No writes performed.");
    return;
  }

  // Delist-only: just the owning user's collection row.
  const { error: delistErr, count: delistCount } = await supabase
    .from("user_collections")
    .delete({ count: "exact" })
    .in("id", shared.map((r) => r.id));
  if (delistErr) throw delistErr;
  console.log(`Delisted (user_collections rows removed): ${delistCount}`);

  // Full delete: user_collections, comic_covers, storage file, comics.
  const unsharedComicIds = unshared.map((r) => r.comic_id);
  const { error: collErr, count: collCount } = await supabase
    .from("user_collections")
    .delete({ count: "exact" })
    .in("id", unshared.map((r) => r.id));
  if (collErr) throw collErr;
  console.log(`user_collections rows deleted (unshared): ${collCount}`);

  const storagePaths = unsharedComicIds.map((id) => coverByComicId.get(id)).filter(Boolean);
  const { error: storageErr } = await supabase.storage.from("comic-covers").remove(storagePaths);
  if (storageErr) console.error("Storage removal failed:", storageErr.message);
  else console.log(`Storage files removed: ${storagePaths.length}`);

  const { error: coverErr, count: coverCount } = await supabase
    .from("comic_covers")
    .delete({ count: "exact" })
    .in("comic_id", unsharedComicIds);
  if (coverErr) throw coverErr;
  console.log(`comic_covers rows deleted: ${coverCount}`);

  const { error: comicsErr, count: comicsCount } = await supabase
    .from("comics")
    .delete({ count: "exact" })
    .in("id", unsharedComicIds);
  if (comicsErr) throw comicsErr;
  console.log(`comics rows deleted: ${comicsCount}`);

  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
