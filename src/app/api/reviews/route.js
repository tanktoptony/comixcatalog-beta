import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { loadBlocked } from "@/lib/feed/loadFeed";
import { getIssueReviews } from "@/lib/issueReviews";
import { orderReviews, validateReviewInput } from "@/lib/reviews";
import { getServiceClient } from "@/lib/supabase/service";

const COLUMNS = "id,user_id,base_gcd_issue_id,rating,body,created_at,updated_at";
const response = (body, init = {}) => NextResponse.json(body, { ...init, headers: { "Cache-Control": "private, no-store", ...(init.headers ?? {}) } });

async function resolveBase(supabase, issueId) {
  const { data, error } = await supabase.from("gcd_issues").select("gcd_id,base_gcd_issue_id").eq("gcd_id", Number(issueId)).maybeSingle();
  if (error) throw error;
  return data ? Number(data.base_gcd_issue_id ?? data.gcd_id) : null;
}

export async function GET(req) {
  const issue = Number(new URL(req.url).searchParams.get("issue"));
  if (!Number.isInteger(issue) || issue <= 0) return response({ error: "Invalid issue." }, { status: 400 });
  const user = await getAuthedUser(req);
  const supabase = getServiceClient();
  try {
    const base = await resolveBase(supabase, issue);
    if (!base) return response({ error: "Issue not found." }, { status: 404 });
    const publicData = await getIssueReviews(supabase, base);
    if (!user) return response({ ...publicData, mine: null, followedIds: [] });
    const [mineResult, followsResult, profileResult, blocked] = await Promise.all([
      supabase.from("issue_reviews").select(COLUMNS).eq("user_id", user.id).eq("base_gcd_issue_id", base).maybeSingle(),
      supabase.from("follows").select("followee_id").eq("follower_id", user.id),
      supabase.from("profiles").select("id,username,avatar_key,avatar_url").eq("id", user.id).maybeSingle(),
      loadBlocked(supabase, user.id),
    ]);
    if (mineResult.error) throw mineResult.error;
    if (followsResult.error) throw followsResult.error;
    if (profileResult.error) throw profileResult.error;
    const followedIds = (followsResult.data ?? []).map((row) => String(row.followee_id)).filter((id) => !blocked.has(id));
    const mine = mineResult.data ? { ...mineResult.data, username: profileResult.data?.username, avatar_key: profileResult.data?.avatar_key, avatar_url: profileResult.data?.avatar_url } : null;
    return response({ summary: publicData.summary, reviews: orderReviews(publicData.reviews, { viewerId: user.id, followedIds, blockedIds: [...blocked] }), mine, followedIds });
  } catch (error) {
    console.error("GET /api/reviews failed:", error);
    return response({ error: "Could not load reviews." }, { status: 500 });
  }
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return response({ error: "Unauthorized" }, { status: 401 });
  const parsed = validateReviewInput(await req.json().catch(() => null));
  if (parsed.error) return response({ error: parsed.error }, { status: 400 });
  const supabase = getServiceClient();
  try {
    const base = await resolveBase(supabase, parsed.value.issueId);
    if (!base) return response({ error: "Issue not found." }, { status: 404 });
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const countResult = await supabase.from("issue_reviews").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("updated_at", since);
    if (countResult.error) throw countResult.error;
    if ((countResult.count ?? 0) >= 60) return response({ error: "You've written a lot of reviews today. Try again tomorrow." }, { status: 429 });
    const { data, error } = await supabase.from("issue_reviews").upsert({ user_id: user.id, base_gcd_issue_id: base, rating: parsed.value.rating, body: parsed.value.body, updated_at: new Date().toISOString() }, { onConflict: "user_id,base_gcd_issue_id" }).select(COLUMNS).single();
    if (error) throw error;
    revalidateTag(`issue:${base}`, { expire: 0 });
    return response(data, { status: 201 });
  } catch (error) {
    console.error("POST /api/reviews failed:", error);
    return response({ error: "Could not save review." }, { status: 500 });
  }
}

export async function DELETE(req) {
  const user = await getAuthedUser(req);
  if (!user) return response({ error: "Unauthorized" }, { status: 401 });
  const issue = Number(new URL(req.url).searchParams.get("issue"));
  if (!Number.isInteger(issue) || issue <= 0) return response({ error: "Invalid issue." }, { status: 400 });
  const supabase = getServiceClient();
  try {
    const base = await resolveBase(supabase, issue);
    if (!base) return response({ error: "Issue not found." }, { status: 404 });
    const { error } = await supabase.from("issue_reviews").delete().eq("user_id", user.id).eq("base_gcd_issue_id", base);
    if (error) throw error;
    revalidateTag(`issue:${base}`, { expire: 0 });
    return response({ ok: true });
  } catch (error) {
    console.error("DELETE /api/reviews failed:", error);
    return response({ error: "Could not delete review." }, { status: 500 });
  }
}
