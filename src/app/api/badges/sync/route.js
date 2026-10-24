import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { BADGE_CATALOG, evaluateBadges } from "@/lib/badges/catalog";
import { buildBadgeStats } from "@/lib/badges/stats";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = getServiceClient();
    const stats = await buildBadgeStats(db, user.id);
    const progress = evaluateBadges(stats);
    const earned = BADGE_CATALOG.filter((badge) => progress[badge.id].earned).map((badge) => badge.id);
    const { data: existing, error } = await db.from("user_badges").select("badge_id").eq("user_id", user.id);
    if (error) throw error;
    const prior = new Set((existing ?? []).map((row) => row.badge_id));
    const newlyEarned = earned.filter((id) => !prior.has(id));
    if (newlyEarned.length) {
      const { error: insertError } = await db.from("user_badges").upsert(
        newlyEarned.map((badgeId) => ({ user_id: user.id, badge_id: badgeId })),
        { onConflict: "user_id,badge_id", ignoreDuplicates: true }
      );
      if (insertError) throw insertError;
    }
    return NextResponse.json({ earned, new: newlyEarned, progress });
  } catch (error) {
    console.error("badge sync failed:", error);
    return NextResponse.json({ error: "Could not update badges" }, { status: 500 });
  }
}
