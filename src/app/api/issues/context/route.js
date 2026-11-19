import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { bestYearFor } from "@/lib/years";
import { canonicalCoverUrl, resolveCovers } from "@/lib/catalog/covers";

// Small book summaries (title, number, year, cover) for the book cards in a
// conversation. Covers go through the shared resolver like every other page.
export async function GET(req) {
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") || "").split(",").map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))].slice(0, 200);
  if (!ids.length) return NextResponse.json({ issues: [] });
  const supabase = getServiceClient();
  const { data: issues, error } = await supabase.from("gcd_issues")
    .select("gcd_id,series_gcd_id,issue_number,publication_date,key_date").in("gcd_id", ids);
  if (error) return NextResponse.json({ error: "Could not load books." }, { status: 500 });
  const seriesIds = [...new Set((issues ?? []).map((row) => row.series_gcd_id).filter(Boolean))];
  const { data: series } = seriesIds.length
    ? await supabase.from("series").select("gcd_id,title,year_start_cached,year_end_cached,resolved_publisher_cached").in("gcd_id", seriesIds)
    : { data: [] };
  const seriesMap = new Map((series ?? []).map((row) => [Number(row.gcd_id), row]));
  const inputs = (issues ?? []).map((row) => {
    const s = seriesMap.get(Number(row.series_gcd_id)) ?? {};
    return {
      gcd_issue_id: Number(row.gcd_id),
      series_gcd_id: row.series_gcd_id,
      series_title: s.title,
      issue_number: row.issue_number,
      year: bestYearFor(row),
      series_year_start: s.year_start_cached,
      series_year_end: s.year_end_cached,
      publisher: s.resolved_publisher_cached,
    };
  });
  let covers = new Map();
  try {
    covers = await resolveCovers(supabase, inputs);
  } catch (coverError) {
    console.error("message book covers failed:", coverError?.message ?? coverError);
  }
  return NextResponse.json({ issues: inputs.map((row) => {
    const path = covers.get(row.gcd_issue_id)?.storage_path;
    return {
      gcd_issue_id: row.gcd_issue_id,
      series_title: row.series_title || "Untitled",
      issue_number: row.issue_number,
      year: row.year,
      cover: path ? canonicalCoverUrl(path) : null,
    };
  }) });
}
