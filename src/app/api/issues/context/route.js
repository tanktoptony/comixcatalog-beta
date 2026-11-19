import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { bestYearFor } from "@/lib/years";

export async function GET(req) {
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") || "").split(",").map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500);
  if (!ids.length) return NextResponse.json({ issues: [] });
  const supabase = getServiceClient();
  const { data: issues, error } = await supabase.from("gcd_issues")
    .select("gcd_id,series_gcd_id,issue_number,publication_date,key_date").in("gcd_id", ids);
  if (error) return NextResponse.json({ error: "Could not load books." }, { status: 500 });
  const seriesIds = [...new Set((issues ?? []).map((row) => row.series_gcd_id).filter(Boolean))];
  const [{ data: series }, { data: covers }] = await Promise.all([
    supabase.from("series").select("gcd_id,title").in("gcd_id", seriesIds),
    supabase.from("canonical_covers").select("gcd_issue_id,storage_path").in("gcd_issue_id", ids),
  ]);
  const titles = new Map((series ?? []).map((row) => [Number(row.gcd_id), row.title]));
  const paths = new Map((covers ?? []).map((row) => [Number(row.gcd_issue_id), row.storage_path]));
  const root = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return NextResponse.json({ issues: (issues ?? []).map((row) => ({
    gcd_issue_id: Number(row.gcd_id),
    series_title: titles.get(Number(row.series_gcd_id)) || "Untitled",
    issue_number: row.issue_number,
    year: bestYearFor(row),
    cover: paths.get(Number(row.gcd_id)) ? `${root}/storage/v1/object/public/canonical-covers/${paths.get(Number(row.gcd_id))}` : null,
  })) });
}
