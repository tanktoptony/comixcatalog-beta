import { getServiceClient } from "./supabase/service.js";

// Server-only helpers for the listing photo routes.

export function adminClient() {
  return getServiceClient();
}

// The collection row, only if it's the caller's and in their collection
// (owned or listed). Photos are for books you have, not your wantlist.
export async function ownedCopy(sb, collectionId, userId) {
  const { data, error } = await sb
    .from("user_collections")
    .select("id, user_id, status")
    .eq("id", collectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId || !["owned", "for_sale"].includes(data.status)) return null;
  return data;
}

export async function photoCounts(sb, userId, collectionId) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const head = () => sb.from("listing_photos").select("id", { count: "exact", head: true });
  const [copy, user, today] = await Promise.all([
    head().eq("collection_id", collectionId),
    head().eq("owner_id", userId),
    head().eq("owner_id", userId).gte("created_at", startOfDay.toISOString()),
  ]);
  for (const r of [copy, user, today]) if (r.error) throw r.error;
  return { copy: copy.count ?? 0, user: user.count ?? 0, today: today.count ?? 0 };
}
