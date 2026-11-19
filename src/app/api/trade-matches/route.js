import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { shapeTradeMatches } from "@/lib/tradeMatches";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to see trade matches." }, { status: 401 });

  const supabase = getServiceClient();
  const { data: rows, error } = await supabase.rpc("social_trade_matches", { p_user: user.id });
  if (error) {
    console.error("trade matches rpc failed", error.code, error.message);
    return NextResponse.json({ error: "Could not load trade matches." }, { status: 500 });
  }

  const memberIds = [...new Set((rows ?? []).map((row) => row.member_id))];
  const issueIds = [...new Set((rows ?? []).flatMap((row) => [...(row.they_have ?? []), ...(row.you_have ?? [])]).map(Number))];
  const [{ data: profiles, error: profileError }, { data: issues, error: issueError }, { data: covers, error: coverError }, { count: wantlistCount, error: wantlistError }] = await Promise.all([
    memberIds.length
      ? supabase.from("profiles").select("id, avatar_key, avatar_url").in("id", memberIds)
      : Promise.resolve({ data: [] }),
    issueIds.length
      ? supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number, key_date").in("gcd_id", issueIds)
      : Promise.resolve({ data: [] }),
    issueIds.length
      ? supabase.from("canonical_covers").select("gcd_issue_id, storage_path").in("gcd_issue_id", issueIds).not("storage_path", "is", null)
      : Promise.resolve({ data: [] }),
    supabase.from("user_collections").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "wishlist"),
  ]);
  if (profileError || issueError || coverError || wantlistError) {
    console.error("trade matches hydration failed", profileError?.message, issueError?.message, coverError?.message, wantlistError?.message);
    return NextResponse.json({ error: "Could not load trade match details." }, { status: 500 });
  }
  const seriesIds = [...new Set((issues ?? []).map((issue) => issue.series_gcd_id).filter(Boolean))];
  const { data: series, error: seriesError } = seriesIds.length
    ? await supabase.from("gcd_series").select("gcd_id, name, year_began").in("gcd_id", seriesIds)
    : { data: [] };
  if (seriesError) {
    console.error("trade matches series lookup failed", seriesError.message);
    return NextResponse.json({ error: "Could not load trade match details." }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const seriesMap = new Map((series ?? []).map((row) => [Number(row.gcd_id), row]));
  const coverMap = new Map();
  for (const cover of covers ?? []) if (!coverMap.has(Number(cover.gcd_issue_id))) coverMap.set(Number(cover.gcd_issue_id), cover.storage_path);
  const bookMap = new Map();
  for (const issue of issues ?? []) {
    const id = Number(issue.gcd_id);
    const seriesRow = seriesMap.get(Number(issue.series_gcd_id));
    const storagePath = coverMap.get(id);
    bookMap.set(id, {
      id,
      title: seriesRow?.name || "Untitled",
      issueNumber: issue.issue_number ?? "",
      year: Number(String(issue.key_date ?? "").slice(0, 4)) || seriesRow?.year_began || null,
      coverUrl: storagePath ? `${baseUrl}/storage/v1/object/public/canonical-covers/${storagePath}` : null,
      href: `/issue/gcd-${id}`,
    });
  }
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return NextResponse.json({ matches: shapeTradeMatches(rows ?? [], bookMap, profileMap).slice(0, 50), hasWantlist: (wantlistCount ?? 0) > 0 });
}
