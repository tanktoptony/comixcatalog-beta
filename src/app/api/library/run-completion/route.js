import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/authServer";
import { baseIssueNumber } from "@/lib/coverMatch";

// Surfaces "runs you're close to finishing" on the profile/library home —
// the same owned-vs-total math /series/[id] already computes per-series,
// aggregated across every series the signed-in user has anything in.
// /series/[id] does this client-side against a globally-loaded collection;
// here we do it server-side since a collector's items can span dozens of
// series and looping per-series client fetches would be slow and wasteful.

const MIN_RUN_SIZE = 3; // one-shots/minis under this aren't a "run" worth chasing
const MAX_RESULTS = 6;
const PAGE = 1000;

async function fetchAllPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

export async function GET(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: ownedRows, error: ownedError } = await supabase
      .from("user_collections")
      .select("gcd_issue_id")
      .eq("user_id", user.id)
      .eq("status", "owned")
      .not("gcd_issue_id", "is", null);
    if (ownedError) throw ownedError;

    const ownedGcdIssueIds = [
      ...new Set((ownedRows ?? []).map((r) => Number(r.gcd_issue_id)).filter(Boolean)),
    ];
    if (ownedGcdIssueIds.length === 0) {
      return NextResponse.json({ runs: [] });
    }

    const ownedIssueRows = await fetchAllPages(() =>
      supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number")
        .in("gcd_id", ownedGcdIssueIds)
    );

    const ownedBySeriesGcdId = new Map();
    for (const row of ownedIssueRows) {
      if (row.series_gcd_id == null) continue;
      const base = baseIssueNumber(row.issue_number);
      if (!base) continue;
      if (!ownedBySeriesGcdId.has(row.series_gcd_id)) {
        ownedBySeriesGcdId.set(row.series_gcd_id, new Set());
      }
      ownedBySeriesGcdId.get(row.series_gcd_id).add(base);
    }

    const seriesGcdIds = [...ownedBySeriesGcdId.keys()];
    if (seriesGcdIds.length === 0) {
      return NextResponse.json({ runs: [] });
    }

    const allIssueRows = await fetchAllPages(() =>
      supabase
        .from("gcd_issues")
        .select("series_gcd_id, issue_number")
        .in("series_gcd_id", seriesGcdIds)
    );

    const totalBySeriesGcdId = new Map();
    for (const row of allIssueRows) {
      const base = baseIssueNumber(row.issue_number);
      if (!base) continue;
      if (!totalBySeriesGcdId.has(row.series_gcd_id)) {
        totalBySeriesGcdId.set(row.series_gcd_id, new Set());
      }
      totalBySeriesGcdId.get(row.series_gcd_id).add(base);
    }

    const { data: seriesRows, error: seriesError } = await supabase
      .from("series")
      .select("id, gcd_id, title, resolved_publisher_cached")
      .in("gcd_id", seriesGcdIds);
    if (seriesError) throw seriesError;
    const seriesByGcdId = new Map((seriesRows ?? []).map((s) => [s.gcd_id, s]));

    const runs = [];
    for (const seriesGcdId of seriesGcdIds) {
      const totalSet = totalBySeriesGcdId.get(seriesGcdId);
      if (!totalSet || totalSet.size < MIN_RUN_SIZE) continue;

      const ownedSet = ownedBySeriesGcdId.get(seriesGcdId) ?? new Set();
      const owned = [...ownedSet].filter((n) => totalSet.has(n)).length;
      const total = totalSet.size;
      if (owned >= total) continue; // already complete — nothing to chase

      const seriesRow = seriesByGcdId.get(seriesGcdId);
      if (!seriesRow) continue; // gcd_id with no matching canonical `series` row

      runs.push({
        series_id: seriesRow.id,
        title: seriesRow.title,
        publisher: seriesRow.resolved_publisher_cached,
        owned,
        total,
        missing: total - owned,
        pct: Math.round((owned / total) * 100),
      });
    }

    runs.sort((a, b) => b.pct - a.pct || b.owned - a.owned);

    return NextResponse.json({ runs: runs.slice(0, MAX_RESULTS) });
  } catch (err) {
    console.error("GET /api/library/run-completion crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
