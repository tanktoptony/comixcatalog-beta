import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { normalizeUpc, isValidUpc, parseUpc, upcProblem } from "@/lib/printings";
import { resolveCovers } from "@/lib/catalog/covers";

const publicCover = (path) => path
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`
  : null;

async function recordPendingRead(supabase, userId, upc) {
  const { data: existing, error: readError } = await supabase.from("pending_barcode_reads")
    .select("id, read_count").eq("user_id", userId).eq("upc", upc).eq("status", "pending").maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await supabase.from("pending_barcode_reads")
      .update({ read_count: existing.read_count + 1, last_read_at: new Date().toISOString() })
      .eq("id", existing.id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("pending_barcode_reads").insert({ user_id: userId, upc });
  if (error?.code !== "23505") {
    if (error) throw error;
  }
}

async function candidatesFor(supabase, printingRows) {
  const ids = [...new Set(printingRows.map((row) => Number(row.gcd_issue_id)))];
  const { data: issues, error: issueError } = await supabase.from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("gcd_id", ids);
  if (issueError) throw issueError;
  const seriesIds = [...new Set((issues ?? []).map((row) => Number(row.series_gcd_id)))];
  const { data: series, error: seriesError } = await supabase.from("series")
    .select("gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached").in("gcd_id", seriesIds);
  if (seriesError) throw seriesError;
  const seriesById = new Map((series ?? []).map((row) => [Number(row.gcd_id), row]));
  const newestFirst = [...(issues ?? [])].sort((a, b) =>
    String(b.publication_date ?? b.key_date ?? "").localeCompare(String(a.publication_date ?? a.key_date ?? ""))
  );
  const coverInputs = newestFirst.map((issue) => {
    const itemSeries = seriesById.get(Number(issue.series_gcd_id));
    return {
      gcd_issue_id: Number(issue.gcd_id), series_gcd_id: Number(issue.series_gcd_id),
      series_title: itemSeries?.title ?? "Unknown series", issue_number: issue.issue_number,
      year: Number(String(issue.key_date ?? issue.publication_date ?? "").match(/\b(\d{4})\b/)?.[1]) || null,
      series_year_start: itemSeries?.year_start_cached ?? null, series_year_end: itemSeries?.year_end_cached ?? null,
    };
  });
  const covers = await resolveCovers(supabase, coverInputs);
  return coverInputs.slice(0, 60).map((issue) => ({
    id: `gcd-${issue.gcd_issue_id}`, gcd_issue_id: issue.gcd_issue_id,
    series_title: issue.series_title, issue_number: issue.issue_number, year: issue.year,
    publisher: seriesById.get(issue.series_gcd_id)?.resolved_publisher_cached ?? null,
    cover_path: publicCover(covers.get(issue.gcd_issue_id)?.storage_path), __source: "barcode",
  }));
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to scan a barcode." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const upc = normalizeUpc(body?.upc);
  if (!isValidUpc(upc)) return NextResponse.json({ error: upcProblem(upc) || "That barcode is not valid." }, { status: 400 });

  try {
    const supabase = getServiceClient();
    const parsed = parseUpc(upc);
    let lookup = supabase.from("issue_printings")
      .select("gcd_issue_id, upc").eq("status", "accepted");
    lookup = parsed.hasSupplement ? lookup.eq("upc", upc) : lookup.eq("upc_main", parsed.base);
    const { data: printings, error } = await lookup;
    if (error) throw error;
    // A full add-on is exact. A main-only phone read intentionally returns
    // every issue sharing that code so the collector can pick the right one.
    if (printings?.length) {
      return NextResponse.json({ matched: true, upc, candidates: await candidatesFor(supabase, printings) });
    }
    await recordPendingRead(supabase, user.id, upc);
    return NextResponse.json({ matched: false, upc, candidates: [] });
  } catch (error) {
    console.error("barcode printing lookup failed", error);
    return NextResponse.json({ error: "Could not check that barcode right now." }, { status: 500 });
  }
}
