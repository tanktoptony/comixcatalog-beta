import { summarizeRatings } from "./reviews.js";

const PAGE = 1000;

export async function getIssueReviews(supabase, baseGcdId, { limit = 50 } = {}) {
  const issueId = Number(baseGcdId);
  const ratings = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("issue_reviews").select("id,rating").eq("base_gcd_issue_id", issueId).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    ratings.push(...(data ?? []).map((row) => Number(row.rating)));
    if ((data?.length ?? 0) < PAGE) break;
  }
  const { data: rows, error } = await supabase.from("issue_reviews").select("id,user_id,rating,body,created_at,updated_at")
    .eq("base_gcd_issue_id", issueId).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(100, Number(limit) || 50)));
  if (error) throw error;
  const ids = [...new Set((rows ?? []).map((row) => row.user_id))];
  const profiles = [];
  for (let i = 0; i < ids.length; i += 500) {
    const result = await supabase.from("profiles").select("id,username,avatar_key,avatar_url,is_public").in("id", ids.slice(i, i + 500));
    if (result.error) throw result.error;
    profiles.push(...(result.data ?? []));
  }
  const byId = new Map(profiles.map((profile) => [String(profile.id), profile]));
  return { summary: summarizeRatings(ratings), reviews: (rows ?? []).flatMap((row) => {
    const profile = byId.get(String(row.user_id));
    return profile?.username && profile.is_public !== false ? [{ ...row, username: profile.username, avatar_key: profile.avatar_key, avatar_url: profile.avatar_url }] : [];
  }) };
}
