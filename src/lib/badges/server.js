import { unstable_cache } from "next/cache";
import { getServiceClient } from "../supabase/service.js";
import { TEST_ACCOUNT_USERNAMES } from "../traction.js";
import { BADGES_BY_ID } from "./catalog.js";
import { badgeRarity } from "./rarity.js";

function must({ data, error, count }, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? data ?? [];
}

// How many collectors hold each badge, and how many collectors there are.
// Ten-minute cache: one read of the view, the member count and the test
// accounts' badges, shared by every badges page and profile.
export const loadBadgeRarity = unstable_cache(async () => {
  const db = getServiceClient();
  const testUsernames = [...TEST_ACCOUNT_USERNAMES];
  const [viewCounts, testProfiles, allMembers] = await Promise.all([
    db.from("badge_rarity").select("badge_id,earned_count").then((r) => must(r, "badge rarity")),
    db.from("profiles").select("id").in("username", testUsernames).then((r) => must(r, "test profiles")),
    db.from("profiles").select("id", { count: "exact", head: true }).not("username", "is", null).then((r) => must(r, "member count")),
  ]);
  const testIds = testProfiles.map((row) => row.id);
  const testRows = testIds.length
    ? must(await db.from("user_badges").select("badge_id").in("user_id", testIds), "test badges")
    : [];
  return badgeRarity({ viewCounts, testRows, memberCount: Number(allMembers) - testIds.length });
}, ["badge-rarity-v1"], { revalidate: 600 });

export async function getProfileBadges(profile) {
  if (!profile?.id) return [];
  const db = getServiceClient();
  const [{ data, error }, rarity] = await Promise.all([
    db.from("user_badges").select("badge_id,earned_at").eq("user_id", profile.id),
    loadBadgeRarity().catch((rarityError) => {
      console.error("badge rarity failed:", rarityError.message);
      return { total: 0, counts: {} };
    }),
  ]);
  if (error) {
    console.error("profile badges failed:", error.message);
    return [];
  }
  let foundingNumber = null;
  if (profile.is_founding_collector && profile.created_at) {
    const result = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_founding_collector", true).lte("created_at", profile.created_at);
    foundingNumber = result.count ?? null;
  }
  return (data ?? []).flatMap((row) => {
    const badge = BADGES_BY_ID.get(row.badge_id);
    return badge ? [{ ...badge, earnedAt: row.earned_at, rarity: rarity.counts[row.badge_id] ?? 0, foundingNumber: badge.id === "founding-collector" ? foundingNumber : null }] : [];
  });
}

export function selectShowcaseBadges(profile, earned) {
  const byId = new Map(earned.map((badge) => [badge.id, badge]));
  const pinned = (profile?.showcase_badges ?? []).map((id) => byId.get(id)).filter(Boolean);
  if (pinned.length) return pinned.slice(0, 4);
  return [...earned].sort((left, right) => left.rarity - right.rarity || left.id.localeCompare(right.id)).slice(0, 4);
}
