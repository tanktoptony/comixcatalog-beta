import { unstable_cache } from "next/cache";
import { getCachedComicsSearch } from "@/app/api/search/comics/route";
import { getCachedSeriesSearch } from "@/app/api/search/series/route";
import { SERIES_SHELF_SIZE } from "@/lib/searchCache";
import { GET as seriesGET } from "@/app/api/series/[id]/route";
import { GET as issueGET } from "@/app/api/issues/[id]/route";
import { GET as publicProfileGET } from "@/app/api/public-profile/route";
import { getServiceClient } from "@/lib/supabase/service";
import { buildVersionRows, resolveEditionRow } from "@/lib/issueEditions";
import { toListing } from "@/lib/listingRow";

// Server-side reads for pages that used to render empty and fetch their
// data from the browser (/search, /series/[id]). The page renders with this
// data already in the HTML, so results are on screen before any JavaScript
// runs; the client components take it as initial state and skip their
// first fetch.
//
// Each loader calls the existing API route handler in-process rather than
// re-implementing it, so the server-rendered first page and every later
// client fetch can never disagree (same pattern as lookupIssue in
// src/lib/productionAssetsServer.js). Results go through Next's data cache,
// shared by every request and region.
//
// The search routes answer an internal error with 200 and an empty list, so
// an empty result is treated as "unknown": it is not cached and the page
// falls back to its client fetch. A real no-results search just costs that
// one extra request.

class EmptyResult extends Error {}
class IssueNotFoundError extends Error {}

async function callRoute(handler, url, key, context) {
  const res = await handler(new Request(url), context);
  if (res.status === 404) throw new IssueNotFoundError(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const body = await res.json();
  const value = body?.[key];
  if (value == null || (Array.isArray(value) && value.length === 0)) throw new EmptyResult();
  return value;
}

// Must match the first-page request SearchPageClient makes.
export const SEARCH_PAGE_SIZE = 36;

const settle = (p) =>
  p.then(
    (value) => value,
    (err) => {
      if (!(err instanceof EmptyResult)) console.error("pageData:", err);
      return null;
    }
  );

// { comics, series }; either may be null, meaning "let the client fetch it".
export async function getInitialSearch(q) {
  const [comicResult, seriesResult] = await Promise.all([
    settle(getCachedComicsSearch(q, { limit: SEARCH_PAGE_SIZE, offset: 0 })),
    settle(getCachedSeriesSearch(q, { limit: SERIES_SHELF_SIZE })),
  ]);
  return {
    comics: comicResult?.comics ?? null,
    series: seriesResult?.series ?? null,
  };
}

const cachedSeries = unstable_cache(
  (id) =>
    callRoute(seriesGET, `http://internal/api/series/${encodeURIComponent(id)}`, "series", {
      params: Promise.resolve({ id }),
    }),
  ["page-series-v3"],
  { revalidate: 600 }
);

// The series payload /api/series/[id] returns, or null (not found, or an
// error the client fetch can retry).
export function getSeriesData(id) {
  return settle(cachedSeries(id));
}

const cachedIssue = unstable_cache(
  (id) =>
    callRoute(issueGET, `http://internal/api/issues/${encodeURIComponent(id)}`, "issue", {
      params: Promise.resolve({ id }),
    }),
  ["page-issue-v2"],
  { revalidate: 3600 }
);

// Anonymous public issue data. The browser still refreshes this with the
// viewer's session after hydration for ownership-specific fields.
export function getIssueData(id) {
  return cachedIssue(id).catch((error) => {
    if (error instanceof IssueNotFoundError) throw error;
    if (!(error instanceof EmptyResult)) console.error("pageData:", error);
    return null;
  });
}

export function isIssueNotFoundError(error) {
  return error instanceof IssueNotFoundError;
}

export async function resolveIssueEdition(gcdId) {
  const id = Number(gcdId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return unstable_cache(async () => {
    const supabase = getServiceClient();
    const result = await supabase.from("gcd_issues").select("*").eq("gcd_id", id).maybeSingle();
    if (result.data) result.data.hasEditionColumns = Object.hasOwn(result.data, "base_gcd_issue_id");
    if (result.error || !result.data) return null;
    return resolveEditionRow(result.data, id);
  }, ["issue-edition-resolution-v1", String(id)], { revalidate: 3600, tags: [`issue:${id}`] })();
}

async function computeIssuePageData(baseGcdId, editionGcdId, hasEditionColumns) {
  const supabase = getServiceClient();
  const selected = await getIssueData(`gcd-${editionGcdId}`);
  if (!selected) return null;

  let editionRows = [{ gcd_id: baseGcdId, variant_name: null }];
  if (hasEditionColumns) {
    const { data, error } = await supabase
      .from("gcd_issues")
      .select("*")
      .eq("base_gcd_issue_id", baseGcdId);
    if (!error && data?.length) editionRows = data;
  }
  const editionIds = [...new Set(editionRows.map((row) => Number(row.gcd_id)).filter(Boolean))];
  if (!editionIds.includes(baseGcdId)) editionIds.unshift(baseGcdId);

  const [{ data: detailRows }, { data: listingRows }, { data: compRows }, baseIssueResult] = await Promise.all([
    supabase.from("gcd_issue_details").select("gcd_issue_id, on_sale_date, price, barcode, variant_name").in("gcd_issue_id", editionIds),
    supabase.from("marketplace_listings").select("id, collection_id, gcd_issue_id, series_title, issue_number, release_year, publisher, variant_label, cover_path, condition, grade_numeric, slab_company, price_cents, shipping_cents, accepts_offers, market_value, auto_market_value, seller_username, created_at").in("gcd_issue_id", editionIds).order("created_at", { ascending: false }).limit(200),
    supabase.from("market_comps").select("sold_price, sold_date, source").in("gcd_issue_id", editionIds).eq("source", "ebay-listed").order("sold_date", { ascending: false }).limit(200),
    baseGcdId === editionGcdId ? Promise.resolve(selected) : getIssueData(`gcd-${baseGcdId}`),
  ]);
  const detailsById = new Map((detailRows ?? []).map((row) => [Number(row.gcd_issue_id), row]));
  const versions = buildVersionRows(editionRows.map((row) => ({
    ...row,
    details: detailsById.get(Number(row.gcd_id)),
  })), baseGcdId);
  const asking = (compRows ?? []).map((row) => Number(row.sold_price)).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const estimate = asking.length ? asking[Math.floor(asking.length / 2)] : null;
  const listings = (listingRows ?? []).map((row) => toListing(row, process.env.NEXT_PUBLIC_SUPABASE_URL));
  const baseIssue = baseIssueResult ?? selected;
  const selectedHasOwnCover = Boolean(selected.cover && (editionGcdId === baseGcdId || selected.cover !== baseIssue?.cover));

  return {
    ...selected,
    id: `gcd-${editionGcdId}`,
    base_gcd_issue_id: baseGcdId,
    edition_gcd_issue_id: editionGcdId,
    edition_name: versions.find((row) => row.gcdId === editionGcdId)?.name ?? null,
    cover: selectedHasOwnCover ? selected.cover : baseIssue?.cover ?? selected.cover,
    edition_has_own_cover: selectedHasOwnCover,
    key_issue: baseIssue?.key_issue ?? null,
    key_ruling: baseIssue?.key_ruling ?? null,
    credits: baseIssue?.credits ?? selected.credits,
    stories: baseIssue?.stories ?? selected.stories,
    ad_pages_count: baseIssue?.ad_pages_count ?? selected.ad_pages_count,
    reprints: baseIssue?.reprints ?? selected.reprints,
    versions,
    listings,
    market: { estimate, sample_size: asking.length, listings_count: listings.length },
  };
}

export function getIssuePageData(baseGcdId, editionGcdId, hasEditionColumns = true) {
  const base = Number(baseGcdId);
  const edition = Number(editionGcdId || base);
  return unstable_cache(
    () => computeIssuePageData(base, edition, hasEditionColumns),
    ["issue-discogs-v1", String(base), String(edition), hasEditionColumns ? "editions" : "legacy"],
    { revalidate: 3600, tags: [`issue:${base}`] }
  )();
}

// The public profile (/u/[username]) for anonymous viewers. The page used to
// fetch our own /api/public-profile over HTTP (an extra serverless hop on
// every view); this calls the handler in-process and caches the result for
// a minute. A missing or private profile caches as { notFound: true }.
const cachedPublicProfile = unstable_cache(
  async (username) => {
    const res = await publicProfileGET(
      new Request(`http://internal/api/public-profile?username=${encodeURIComponent(username)}`)
    );
    if (res.status === 400 || res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`public-profile returned ${res.status}`);
    return res.json();
  },
  ["page-public-profile-v1"],
  { revalidate: 60 }
);

export function getPublicProfile(username) {
  return cachedPublicProfile(username);
}
