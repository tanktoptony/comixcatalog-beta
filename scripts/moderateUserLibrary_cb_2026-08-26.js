// One-off moderation pass for user "cb_" (id 10c96c1c-ba04-4504-b89b-
// 83eb8801cfdd), flagged 2026-08-26 as having added several books
// incorrectly via the old pre-catalog-linking "add comic" flow. All 18 of
// their items are manual `comics` rows (no gcd_issue_id links at all).
// Confirmed via query: none of the 10 comics rows touched here are
// referenced by any OTHER user's user_collections row, so these edits are
// scoped entirely to cb_'s library.
//
// Actions, per founder review:
//   - Remove: "Watchmen" issue_number "Limited Collectors' Series Pins" —
//     not a real standalone issue (a promo insert, not a comic).
//   - Remove: Elfquest #1-5, attributed to "Marvel Comics" — wrong
//     publisher (original run was WaRP Graphics) and a relic of the old
//     add-comic method; not worth correcting in place, just remove.
//   - Fix: Batman "The Dark Knight Returns" #2 and #3 were filed under
//     their own issue subtitles ("Batman Dark Knight Triumphant",
//     "Batman Hunt the Dark Knight") as if they were separate series.
//     Corrected to the real series title so all three issues line up.
//   - Fix: "Daredevile" #227 -> "Daredevil" (typo).
//
// Usage: node scripts/moderateUserLibrary_cb_2026-08-26.js [--dry-run]

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes("--dry-run");

const USER_ID = "10c96c1c-ba04-4504-b89b-83eb8801cfdd";

const REMOVE_COMIC_IDS = [
  "f44efaa0-c45f-48e9-834a-b827fc7e12da", // Watchmen — "Limited Collectors' Series Pins"
  "d8a38e7a-b7c5-412c-9ed8-b81169f6b374", // Elfquest #1
  "633412bd-1ef2-4c01-b61b-5be984102379", // Elfquest #2
  "427d720b-1c7e-4a04-ab0b-cd7e592a72a3", // Elfquest #3
  "cc9db371-8f20-4807-8f82-e3c69a98b773", // Elfquest #4
  "7d747792-6dc6-421a-a740-765bfe61070d", // Elfquest #5
];

const FIX_TITLES = [
  { comic_id: "8e9fd391-caa3-4f51-a664-b3b81862ec4e", series_title: "Batman: The Dark Knight Returns" }, // was "Batman  The Dark Knight Returns"
  { comic_id: "a2d2e220-aaed-48e8-8e7a-5779d0057283", series_title: "Batman: The Dark Knight Returns" }, // was "Batman Dark Knight Triumphant"
  { comic_id: "8d50a725-f45c-4e3e-a284-f262f5704903", series_title: "Batman: The Dark Knight Returns" }, // was "Batman Hunt the Dark Knight"
  { comic_id: "870bf49f-6ba3-4814-9b13-5b8fcc6a6b82", series_title: "Daredevil" }, // was "Daredevile"
];

async function run() {
  console.log(`${DRY_RUN ? "[dry-run] " : ""}Removing ${REMOVE_COMIC_IDS.length} items (user_collections + comics rows)...`);
  if (!DRY_RUN) {
    const { error: delCollErr, count: delCollCount } = await supabase
      .from("user_collections")
      .delete({ count: "exact" })
      .eq("user_id", USER_ID)
      .in("comic_id", REMOVE_COMIC_IDS);
    if (delCollErr) throw delCollErr;
    console.log(`  user_collections rows deleted: ${delCollCount}`);

    const { error: delComicsErr, count: delComicsCount } = await supabase
      .from("comics")
      .delete({ count: "exact" })
      .in("id", REMOVE_COMIC_IDS);
    if (delComicsErr) throw delComicsErr;
    console.log(`  comics rows deleted: ${delComicsCount}`);
  }

  console.log(`\n${DRY_RUN ? "[dry-run] " : ""}Fixing ${FIX_TITLES.length} mislabeled series_title values...`);
  for (const fix of FIX_TITLES) {
    console.log(`  ${fix.comic_id} -> "${fix.series_title}"`);
    if (!DRY_RUN) {
      const { error } = await supabase.from("comics").update({ series_title: fix.series_title }).eq("id", fix.comic_id);
      if (error) throw error;
    }
  }

  console.log(`\n${DRY_RUN ? "[dry-run] " : ""}Done.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
