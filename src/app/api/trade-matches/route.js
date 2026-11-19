import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { shapeTradeMatches } from "@/lib/tradeMatches";
import { canonicalCoverUrl, resolveCovers } from "@/lib/catalog/covers";

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
  const [{ data: profiles, error: profileError }, { data: issues, error: issueError }, { count: wantlistCount, error: wantlistError }] = await Promise.all([
    memberIds.length
      ? supabase.from("profiles").select("id, avatar_key, avatar_url").in("id", memberIds)
      : Promise.resolve({ data: [] }),
    issueIds.length
      ? supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number, key_date").in("gcd_id", issueIds)
      : Promise.resolve({ data: [] }),
    supabase.from("user_collections").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "wishlist"),
  ]);
  if (profileError || issueError || wantlistError) {
    console.error("trade matches hydration failed", profileError?.message, issueError?.message, wantlistError?.message);
    return NextResponse.json({ error: "Could not load trade match details." }, { status: 500 });
  }
  const seriesIds = [...new Set((issues ?? []).map((issue) => issue.series_gcd_id).filter(Boolean))];
  const { data: series, error: seriesError } = seriesIds.length
    ? await supabase.from("series").select("gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached").in("gcd_id", seriesIds)
    : { data: [] };
  if (seriesError) {
    console.error("trade matches series lookup failed", seriesError.message);
    return NextResponse.json({ error: "Could not load trade match details." }, { status: 500 });
  }

  const seriesMap = new Map((series ?? []).map((row) => [Number(row.gcd_id), row]));
  // Covers go through the shared resolver (exact issue, then series + number,
  // then guarded siblings), same as every other page.
  const coverInputs = (issues ?? []).map((issue) => {
    const s = seriesMap.get(Number(issue.series_gcd_id)) ?? {};
    return {
      gcd_issue_id: Number(issue.gcd_id),
      series_gcd_id: issue.series_gcd_id,
      series_title: s.title,
      issue_number: issue.issue_number,
      year: Number(String(issue.key_date ?? "").slice(0, 4)) || null,
      series_year_start: s.year_start_cached,
      series_year_end: s.year_end_cached,
      publisher: s.resolved_publisher_cached,
    };
  });
  let covers = new Map();
  try {
    covers = await resolveCovers(supabase, coverInputs);
  } catch (coverError) {
    console.error("trade matches cover lookup failed", coverError?.message ?? coverError);
  }
  const bookMap = new Map();
  for (const input of coverInputs) {
    const storagePath = covers.get(input.gcd_issue_id)?.storage_path;
    bookMap.set(input.gcd_issue_id, {
      id: input.gcd_issue_id,
      title: input.series_title || "Untitled",
      issueNumber: input.issue_number ?? "",
      year: input.year || input.series_year_start || null,
      coverUrl: storagePath ? canonicalCoverUrl(storagePath) : null,
      href: `/issue/gcd-${input.gcd_issue_id}`,
    });
  }
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  return NextResponse.json({ matches: shapeTradeMatches(rows ?? [], bookMap, profileMap).slice(0, 50), hasWantlist: (wantlistCount ?? 0) > 0 });
}
