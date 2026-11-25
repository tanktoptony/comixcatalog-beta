import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canonicalCoverUrl, resolveCovers } from "@/lib/catalog/covers";
import { getListings } from "@/lib/marketplace";
import { listingName } from "@/lib/marketplaceFormat";
import { loadPriceChartingRows, pcValueForIssue } from "@/lib/pcValue";
import { marketPicks, marketStats, sellerSummary, wantlistCards } from "@/lib/shelfHunt";
import { getServiceClient } from "@/lib/supabase/service";

// The signed-in homepage's hunt sections, loaded after the shelf so they
// never hold up the value card. Reads: the viewer's wantlist rows, their
// issues and series, guide prices, covers, the cached marketplace listing set
// and the base issue of each listed copy. Chunked reads are continuations
// required by PostgREST's limits.
const CHUNK = 500;
const chunks = (values) => Array.from({ length: Math.ceil(values.length / CHUNK) }, (_, i) => values.slice(i * CHUNK, (i + 1) * CHUNK));

async function inChunks(ids, read) {
  const out = [];
  for (const group of chunks(ids)) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await read(group).range(from, from + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

async function loadWantlist(supabase, userId, listings) {
  const rows = await inChunks([userId], (group) => supabase.from("user_collections")
    .select("id, gcd_issue_id").in("user_id", group).eq("status", "wishlist").not("gcd_issue_id", "is", null).order("id"));
  const ids = [...new Set(rows.map((row) => Number(row.gcd_issue_id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return wantlistCards([], new Map());

  const issues = await inChunks(ids, (group) => supabase.from("gcd_issues")
    .select("gcd_id, base_gcd_issue_id, variant_of_gcd_id, series_gcd_id, issue_number").in("gcd_id", group).order("gcd_id"));
  const seriesIds = [...new Set(issues.map((row) => row.series_gcd_id).filter((value) => value != null))];
  const series = await inChunks(seriesIds, (group) => supabase.from("series")
    .select("id, gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached").in("gcd_id", group).order("id"));
  const seriesByGcd = new Map(series.map((row) => [Number(row.gcd_id), row]));

  const regularIds = issues.map((row) => row.variant_of_gcd_id).filter((value) => value != null);
  const [{ rowsByIssue, error: guideError }, covers] = await Promise.all([
    loadPriceChartingRows(supabase, [...ids, ...regularIds]),
    resolveCovers(supabase, issues.map((row) => {
      const s = seriesByGcd.get(Number(row.series_gcd_id));
      return { gcd_issue_id: Number(row.gcd_id), series_gcd_id: row.series_gcd_id, issue_number: row.issue_number,
        series_title: s?.title, publisher: s?.resolved_publisher_cached, series_year_start: s?.year_start_cached, series_year_end: s?.year_end_cached };
    })),
  ]);
  if (guideError) console.error("shelf hunt guide prices failed:", guideError);

  // Listed copies keyed by base issue, so a wanted issue matches any edition of it.
  const listedIds = [...new Set(listings.map((l) => l.gcdIssueId))];
  const listedIssues = listedIds.length ? await inChunks(listedIds, (group) => supabase.from("gcd_issues")
    .select("gcd_id, base_gcd_issue_id").in("gcd_id", group).order("gcd_id")) : [];
  const baseOf = new Map(listedIssues.map((row) => [Number(row.gcd_id), Number(row.base_gcd_issue_id ?? row.gcd_id)]));
  const listingsByBase = new Map();
  for (const l of listings) {
    if (l.sellerId === userId) continue;
    const base = baseOf.get(l.gcdIssueId) ?? l.gcdIssueId;
    if (!listingsByBase.has(base)) listingsByBase.set(base, []);
    listingsByBase.get(base).push(l);
  }

  const wanted = issues.map((row) => {
    const s = seriesByGcd.get(Number(row.series_gcd_id));
    const value = pcValueForIssue(rowsByIssue, { gcd_issue_id: Number(row.gcd_id) }, row.variant_of_gcd_id);
    return {
      gcd_issue_id: Number(row.gcd_id),
      base_gcd_issue_id: Number(row.base_gcd_issue_id ?? row.gcd_id),
      title: s?.title ?? "Untitled",
      issue_number: row.issue_number ?? "",
      cover_url: canonicalCoverUrl(covers.get(Number(row.gcd_id))?.storage_path),
      href: `/issue/gcd-${row.gcd_id}`,
      guide: value?.url ? { value: value.value, url: value.url } : null,
    };
  });
  return wantlistCards(wanted, listingsByBase);
}

const pickFields = (l) => ({
  id: l.id, href: l.listingHref, title: l.title, name: listingName(l), issue_number: l.issueNumber, year: l.year, cover: l.cover,
  price: l.price, guide: l.guide ? { value: l.guide.value, url: l.guide.url } : null,
  key: l.key ? (l.key.reason || l.key.character) : null, buy_now: Boolean(l.buyNow), seller: l.seller,
});

export async function GET(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getServiceClient();
    let listings = [];
    try { listings = await getListings(); } catch (error) { console.error("shelf hunt listings failed:", error); }
    const wantlist = await loadWantlist(supabase, user.id, listings);
    return NextResponse.json({
      wantlist,
      market: { stats: marketStats(listings, user.id), picks: marketPicks(listings, user.id).map(pickFields) },
      selling: sellerSummary(listings, user.id),
    });
  } catch (error) {
    console.error("GET /api/shelf/hunt crashed:", error);
    return NextResponse.json({ error: "Could not load this section." }, { status: 500 });
  }
}
