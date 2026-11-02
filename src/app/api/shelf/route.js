import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { baseIssueNumber } from "@/lib/coverMatch";
import { canonicalCoverUrl, resolveCovers } from "@/lib/catalog/covers";
import { loadRunCompletion, MIN_RUN_SIZE } from "@/lib/runCompletion";
import { getServiceClient } from "@/lib/supabase/service";

// About eight indexed read stages per shelf view: value, collection rows,
// owned issue metadata, run issues, series, keys, recent covers, gap listings.
// Chunked requests are continuations required by PostgREST's limits.
const CHUNK = 500;
const chunks = (values) => Array.from({ length: Math.ceil(values.length / CHUNK) }, (_, i) => values.slice(i * CHUNK, (i + 1) * CHUNK));

export async function GET(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getServiceClient();
    const [valueResult, runData] = await Promise.all([
      supabase.from("collection_value_history")
        .select("total_value, owned_count, priced_count, snapshot_date")
        .eq("user_id", user.id).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
      loadRunCompletion(supabase, user.id),
    ]);
    if (valueResult.error) throw valueResult.error;

    const keyReferences = new Set();
    for (const issueRows of chunks(runData.ownedIssueRows)) {
      const keyIds = [...new Set((issueRows ?? []).flatMap((row) => [Number(row.gcd_id), Number(row.base_gcd_issue_id)]).filter(Number.isInteger))];
      for (const keyGroup of chunks(keyIds)) {
        const { data: keys, error: keyError } = await supabase.from("key_issues").select("gcd_issue_id").in("gcd_issue_id", keyGroup);
        if (keyError) throw keyError;
        for (const row of keys ?? []) keyReferences.add(Number(row.gcd_issue_id));
      }
    }
    const keyCount = new Set(runData.ownedIssueRows.filter((row) => keyReferences.has(Number(row.gcd_id))
      || keyReferences.has(Number(row.base_gcd_issue_id))).map((row) => Number(row.gcd_id))).size;

    const recentRows = [...runData.ownedRows].filter((row) => row.gcd_issue_id != null)
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at))).slice(0, 6);
    const recentIds = recentRows.map((row) => Number(row.gcd_issue_id));
    const recentIdSet = new Set(recentIds);
    const recentIssues = runData.ownedIssueRows.filter((row) => recentIdSet.has(Number(row.gcd_id)));
    const seriesByGcd = new Map(runData.seriesRows.map((row) => [Number(row.gcd_id), row]));
    const coverInputs = recentIssues.map((row) => {
      const series = seriesByGcd.get(Number(row.series_gcd_id));
      return { gcd_issue_id: Number(row.gcd_id), series_gcd_id: row.series_gcd_id, issue_number: row.issue_number,
        series_title: series?.title, publisher: series?.resolved_publisher_cached,
        series_year_start: series?.year_start_cached, series_year_end: series?.year_end_cached };
    });
    const covers = await resolveCovers(supabase, coverInputs);
    const issueById = new Map(recentIssues.map((row) => [Number(row.gcd_id), row]));
    const recent = recentRows.map((collection) => {
      const issue = issueById.get(Number(collection.gcd_issue_id));
      const series = issue ? seriesByGcd.get(Number(issue.series_gcd_id)) : null;
      const cover = covers.get(Number(collection.gcd_issue_id));
      return issue && series ? { gcd_issue_id: Number(issue.gcd_id), title: series.title, issue_number: issue.issue_number,
        cover_url: canonicalCoverUrl(cover?.storage_path), href: `/issue/${issue.gcd_id}` } : null;
    }).filter(Boolean);

    const complete = runData.runs.filter((run) => run.total >= MIN_RUN_SIZE && run.owned === run.total).length;
    const finish = runData.runs.filter((run) => run.owned < run.total && run.pct >= 60).slice(0, 3);
    const gapIssueIds = new Map();
    for (const run of finish) {
      const missing = new Set(run.missing_numbers);
      gapIssueIds.set(run.series_id, runData.allIssueRows
        .filter((row) => row.series_gcd_id === run.series_gcd_id && missing.has(baseIssueNumber(row.issue_number)))
        .map((row) => Number(row.gcd_id)));
    }
    const listingCounts = new Map();
    const seriesByGapIssue = new Map();
    for (const [seriesId, ids] of gapIssueIds) {
      listingCounts.set(seriesId, 0);
      for (const id of ids) seriesByGapIssue.set(id, seriesId);
    }
    for (const group of chunks([...seriesByGapIssue.keys()])) {
      const { data: listings, error } = await supabase.from("marketplace_listings")
        .select("gcd_issue_id").in("gcd_issue_id", group);
      if (error) throw error;
      for (const listing of listings ?? []) {
        const seriesId = seriesByGapIssue.get(Number(listing.gcd_issue_id));
        if (seriesId) listingCounts.set(seriesId, (listingCounts.get(seriesId) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      value: valueResult.data ? { total: Number(valueResult.data.total_value), owned_count: valueResult.data.owned_count,
        priced_count: valueResult.data.priced_count, snapshot_date: valueResult.data.snapshot_date } : null,
      counts: { books: runData.ownedRows.length, keys: keyCount, runs_complete: complete,
        wantlist: runData.collectionRows.filter((row) => row.status === "wishlist").length },
      recent,
      runs: finish.map((run) => ({ series_id: run.series_id, title: run.title, publisher: run.publisher, owned: run.owned,
        total: run.total, pct: run.pct, missing: run.missing, missing_preview: run.missing_numbers.slice(0, 2),
        for_sale: listingCounts.get(run.series_id) ?? 0, href: `/series/${run.series_id}` })),
    });
  } catch (error) {
    console.error("GET /api/shelf crashed:", error);
    return NextResponse.json({ error: "Could not load your shelf." }, { status: 500 });
  }
}
