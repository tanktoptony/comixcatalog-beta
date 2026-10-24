import { getServiceClient } from "../supabase/service.js";
import { BADGES_BY_ID } from "./catalog.js";

export async function getProfileBadges(profile) {
  if (!profile?.id) return [];
  const db = getServiceClient();
  const [{ data, error }, rarityResult] = await Promise.all([
    db.from("user_badges").select("badge_id,earned_at").eq("user_id", profile.id),
    db.from("badge_rarity").select("badge_id,earned_count"),
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
  const rarity = new Map();
  for (const row of rarityResult.data ?? []) rarity.set(row.badge_id, Number(row.earned_count));
  return (data ?? []).flatMap((row) => {
    const badge = BADGES_BY_ID.get(row.badge_id);
    return badge ? [{ ...badge, earnedAt: row.earned_at, rarity: rarity.get(row.badge_id) ?? 0, foundingNumber: badge.id === "founding-collector" ? foundingNumber : null }] : [];
  });
}

export function selectShowcaseBadges(profile, earned) {
  const byId = new Map(earned.map((badge) => [badge.id, badge]));
  const pinned = (profile?.showcase_badges ?? []).map((id) => byId.get(id)).filter(Boolean);
  if (pinned.length) return pinned.slice(0, 4);
  return [...earned].sort((left, right) => left.rarity - right.rarity || left.id.localeCompare(right.id)).slice(0, 4);
}
