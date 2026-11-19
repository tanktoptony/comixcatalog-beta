import { fetchAllPages } from "./supabase/fetchAllPages.js";

const INTERNAL_USERS = new Set(["test_tony", "test_tony_depaul", "thrice347"]);
const PRIVACY_FLAG = { owned: "show_collection", wishlist: "show_wantlist", for_sale: "show_for_sale" };

export function buildIssueCollectors(rows, profilesById, limit = 12) {
  const buckets = { owned: new Map(), wishlist: new Map(), for_sale: new Map() };
  for (const row of rows ?? []) {
    const bucket = buckets[row.status];
    if (!bucket) continue;
    const profile = profilesById instanceof Map ? profilesById.get(String(row.user_id)) : profilesById?.[String(row.user_id)];
    if (!profile?.username || profile.is_public !== true || INTERNAL_USERS.has(profile.username)) continue;
    if (profile[PRIVACY_FLAG[row.status]] === false) continue;
    if (!bucket.has(String(row.user_id))) bucket.set(String(row.user_id), { ...profile });
  }
  const result = {};
  for (const [key, status] of [["have", "owned"], ["want", "wishlist"], ["sell", "for_sale"]]) {
    const all = [...buckets[status].values()];
    result[key] = { members: all.slice(0, limit), total: all.length };
  }
  return result;
}

export async function getIssueCollectors(supabase, editionIds) {
  const ids = [...new Set((editionIds ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return buildIssueCollectors([], new Map());
  const rows = await fetchAllPages(() => supabase.from("user_collections")
    .select("id,user_id,status,created_at")
    .in("gcd_issue_id", ids)
    .in("status", ["owned", "wishlist", "for_sale"])
    .order("created_at", { ascending: false }), "id");
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  const profiles = [];
  for (let i = 0; i < userIds.length; i += 500) {
    const { data, error } = await supabase.from("profiles")
      .select("id,username,avatar_key,avatar_url,is_public,show_collection,show_wantlist,show_for_sale")
      .in("id", userIds.slice(i, i + 500));
    if (error) throw error;
    profiles.push(...(data ?? []));
  }
  return buildIssueCollectors(rows, new Map(profiles.map((profile) => [String(profile.id), profile])));
}
