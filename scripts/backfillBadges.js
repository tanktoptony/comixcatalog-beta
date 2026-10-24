// Award badges to existing members. Dry run by default; pass --apply to write.
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { BADGE_CATALOG, evaluateBadges } from "../src/lib/badges/catalog.js";
import { buildBadgeStats } from "../src/lib/badges/stats.js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";

dotenv.config({ path: ".env.local" });

const apply = process.argv.includes("--apply");
if (process.argv.some((arg) => arg.startsWith("--") && arg !== "--apply" && arg !== "--dry-run")) throw new Error("Use --dry-run or --apply");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const profiles = await fetchAllPages(() => db.from("profiles").select("id,username").not("username", "is", null));
let awards = 0;
for (const profile of profiles) {
  const stats = await buildBadgeStats(db, profile.id);
  const evaluations = evaluateBadges(stats);
  const earned = BADGE_CATALOG.filter((badge) => evaluations[badge.id].earned);
  const ownedRows = await fetchAllPages(() => db.from("user_collections").select("created_at,status").eq("user_id", profile.id));
  const ownedDates = ownedRows.filter((row) => row.status === "owned" || row.status === "for_sale").map((row) => row.created_at).sort();
  const rows = earned.map((badge) => ({
    user_id: profile.id,
    badge_id: badge.id,
    earned_at: badge.group === "Milestones" ? ownedDates[badge.threshold - 1] : new Date().toISOString(),
  }));
  awards += rows.length;
  if (apply && rows.length) {
    const { error } = await db.from("user_badges").upsert(rows, { onConflict: "user_id,badge_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  console.log(`${apply ? "awarded" : "would award"} ${rows.length} to @${profile.username}`);
}
console.log(`${apply ? "Applied" : "Dry run"}: ${awards} awards across ${profiles.length} members.`);
