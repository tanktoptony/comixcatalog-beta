import { gunzipSync, gzipSync } from "node:zlib";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/authServer";
import { ADMIN_ID, canSeePrivateMembers } from "@/lib/admin";
import { aalFromToken, bearerToken } from "@/lib/adminAal";
import { getMarketValuesBulk } from "@/lib/marketValue";
import { normTitle, titleVariants } from "@/lib/titleMatch";
import { isOwnedStatus } from "@/lib/collectionStatus";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { bestYearFor, parseYear } from "@/lib/years";
import { createServerTiming } from "@/lib/serverTiming";
import { resolveCovers } from "@/lib/catalog/covers";
import { coverBatches } from "@/lib/coverBatches";
import {
  parsePublicProfileQuery,
  profileResponseAllowed,
  queryPublicProfileRows,
  selectPublicProfileHighlights,
  summarizePublicProfileRows,
} from "@/lib/publicProfilePaging";

const IN_CHUNK = 500;
const norm = (value) => String(value ?? "").trim().toLowerCase();

function displayNumbersByKey(rows, keyOf) {
  const numbers = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const issueNumber = row.display?.issueNumber;
    if (key == null || issueNumber == null) continue;
    if (!numbers.has(key)) numbers.set(key, new Set());
    numbers.get(key).add(issueNumber);
  }
  return numbers;
}

async function readBatches(batches, read) {
  if (!batches.length) return [];
  const results = new Array(batches.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, async () => {
    while (next < batches.length) {
      const index = next;
      next += 1;
      results[index] = await fetchAllPages(() => read(batches[index]), "id");
    }
  }));
  return results.flat();
}

async function readInChunks(ids, read, orderCol = "id") {
  const rows = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    rows.push(...await fetchAllPages(() => read(ids.slice(index, index + IN_CHUNK)), orderCol));
  }
  return rows;
}

function visibleCollectionRows(rows, visibility) {
  return rows.filter((item) => {
    if (item.status === "owned" && !visibility.collection) return false;
    if (item.status === "wishlist" && !visibility.wantlist) return false;
    if (item.status === "for_sale" && !visibility.for_sale) return false;
    return true;
  });
}

async function loadProfileIndex(profileId, visibility) {
  const supabase = getServiceClient();
  let degraded = false;
  const collection = visibleCollectionRows(await fetchAllPages(() =>
    supabase.from("user_collections").select(`
      id, status, condition, grade_numeric, slab_company, purchase_price,
      market_value, created_at, comic_id, gcd_issue_id, user_cover_url,
      variant_label, copy_number, open_to_trade,
      comics!user_collections_comic_id_fkey (
        id, issue_number, release_year, series_title, publisher,
        comic_covers ( image_path, is_primary )
      )
    `).eq("user_id", profileId), "id"), visibility);

  const gcdIds = [...new Set(collection.map((item) => item.gcd_issue_id).filter((id) => id != null))];
  const hasForSale = collection.some((item) => item.status === "for_sale");
  const [issues, keyResult, listingResult] = await Promise.all([
    readInChunks(gcdIds, (chunk) => supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
      .in("gcd_id", chunk), "gcd_id"),
    gcdIds.length
      ? readInChunks(gcdIds, (chunk) => supabase
          .from("key_issues")
          .select("id, gcd_issue_id, character, reason, tier")
          .in("gcd_issue_id", chunk), "id")
          .then((data) => ({ data, error: null }), (error) => ({ data: [], error }))
      : { data: [], error: null },
    hasForSale
      ? fetchAllPages(() => supabase
          .from("listings")
          .select("id, collection_id, price_cents")
          .eq("seller_id", profileId)
          .eq("status", "active"), "id")
          .then((data) => ({ data, error: null }), (error) => ({ data: [], error }))
      : { data: [], error: null },
  ]);

  if (keyResult.error) {
    console.error("public profile key issue lookup failed:", keyResult.error.code, keyResult.error.message);
    degraded = true;
  }
  if (listingResult.error) {
    console.error("public profile listing price lookup failed:", listingResult.error.code, listingResult.error.message);
    degraded = true;
  }

  const seriesIds = [...new Set(issues.map((issue) => issue.series_gcd_id).filter(Boolean))];
  const seriesRows = await readInChunks(seriesIds, (chunk) => supabase
    .from("series")
    .select("id, gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached, publisher:publisher_id(name)")
    .in("gcd_id", chunk), "id");
  const issueById = new Map(issues.map((issue) => [Number(issue.gcd_id), issue]));
  const seriesById = new Map(seriesRows.map((series) => [Number(series.gcd_id), series]));
  const keyByIssue = new Map((keyResult.data ?? []).map((row) => [Number(row.gcd_issue_id), {
    character: row.character,
    reason: row.reason,
    tier: row.tier,
  }]));
  const listingByCollection = new Map((listingResult.data ?? []).map((row) => [row.collection_id, row]));

  const indexed = collection.map((item) => {
    const issue = item.gcd_issue_id == null ? null : issueById.get(Number(item.gcd_issue_id));
    const series = issue ? seriesById.get(Number(issue.series_gcd_id)) : null;
    const comic = item.comics;
    const communityCover = comic?.comic_covers?.find((cover) => cover.is_primary) ?? comic?.comic_covers?.[0];
    const listing = listingByCollection.get(item.id);
    const display = issue ? {
      title: series?.title ?? "Untitled",
      issueNumber: issue.issue_number ?? "",
      year: bestYearFor(issue),
      publisher: series?.resolved_publisher_cached ?? series?.publisher?.name ?? null,
      href: `/issue/gcd-${issue.gcd_id}`,
    } : comic ? {
      title: comic.series_title || "Untitled",
      issueNumber: comic.issue_number ?? "",
      year: comic.release_year ?? null,
      publisher: comic.publisher ?? null,
      href: `/comic/${comic.id}`,
    } : null;
    if (!display) return null;
    return {
      id: item.id,
      status: item.status,
      condition: item.condition,
      grade_numeric: item.grade_numeric,
      slab_company: item.slab_company,
      purchase_price: visibility.value ? item.purchase_price : null,
      market_value: visibility.value ? item.market_value : null,
      created_at: item.created_at,
      gcd_issue_id: item.gcd_issue_id,
      variant_label: item.variant_label,
      copy_number: item.copy_number,
      open_to_trade: item.open_to_trade,
      listing_id: item.status === "for_sale" ? listing?.id ?? null : undefined,
      listing_price: item.status === "for_sale" && listing?.price_cents != null ? listing.price_cents / 100 : undefined,
      display,
      key_issue: item.gcd_issue_id == null ? null : keyByIssue.get(Number(item.gcd_issue_id)) ?? null,
      _series_gcd_id: issue?.series_gcd_id ?? null,
      _series_year_start: series?.year_start_cached ?? null,
      _series_year_end: series?.year_end_cached ?? null,
      _user_cover_path: item.user_cover_url ?? null,
      _community_cover_path: communityCover?.image_path ?? null,
    };
  }).filter(Boolean);

  if (visibility.value) {
    const gradeSignals = indexed
      .filter((item) => isOwnedStatus(item.status) && item.gcd_issue_id != null)
      .map((item) => ({
        collection_id: item.id,
        gcd_issue_id: item.gcd_issue_id,
        grade_numeric: item.grade_numeric,
        slab_company: item.slab_company,
        condition: item.condition,
        release_year: item.display.year,
      }));
    try {
      const values = await getMarketValuesBulk({ supabase, items: gradeSignals });
      for (const item of indexed) {
        const manual = Number(item.market_value);
        if (Number.isFinite(manual) && manual > 0) continue;
        const automatic = values.get(item.id);
        if (automatic?.value > 0) item.market_value = automatic.value;
      }
    } catch (error) {
      console.error("public profile value lookup failed:", error?.code, error?.message);
      degraded = true;
    }
  }
  return { rows: indexed, degraded };
}

const cachedProfileIndex = unstable_cache(async (profileId, visibilityJson) => {
  const loaded = await loadProfileIndex(profileId, JSON.parse(visibilityJson));
  return gzipSync(Buffer.from(JSON.stringify(loaded))).toString("base64");
}, ["public-profile-index-v1"], { revalidate: 60 });

async function getProfileIndex(profileId, visibility, cacheable) {
  if (!cacheable) return loadProfileIndex(profileId, visibility);
  const compressed = await cachedProfileIndex(profileId, JSON.stringify(visibility));
  return JSON.parse(gunzipSync(Buffer.from(compressed, "base64")).toString("utf8"));
}

function yearOfCover(cover) {
  return parseYear(cover.cover_date) ?? (cover.series_year != null ? Number(cover.series_year) : null);
}

function pickStoragePath(candidates, issueYear, seriesYearStart, seriesYearEnd) {
  if (!candidates?.length) return null;
  if (issueYear != null) {
    let best = null;
    let bestDiff = Infinity;
    for (const candidate of candidates) {
      const year = yearOfCover(candidate);
      if (year == null) continue;
      const difference = Math.abs(year - issueYear);
      if (difference <= 1 && difference < bestDiff) {
        best = candidate;
        bestDiff = difference;
      }
    }
    return best?.storage_path ?? null;
  }
  if (seriesYearStart != null) {
    const low = Number(seriesYearStart) - 1;
    const high = Number(seriesYearEnd ?? Number(seriesYearStart) + 30) + 1;
    const inWindow = candidates
      .map((candidate) => ({ candidate, year: yearOfCover(candidate) }))
      .filter(({ year }) => year != null && year >= low && year <= high)
      .sort((left, right) => left.year - right.year)[0];
    if (inWindow) return inWindow.candidate.storage_path;
  }
  return [...candidates].sort((left, right) => (yearOfCover(left) ?? Infinity) - (yearOfCover(right) ?? Infinity))[0]?.storage_path ?? null;
}

async function resolvePageItems(supabase, rows) {
  if (!rows.length) return [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const gcdRows = rows.filter((item) => item.gcd_issue_id != null);
  const seriesIds = [...new Set(gcdRows.map((item) => item._series_gcd_id).filter(Boolean))];
  const titles = [...new Set(gcdRows.map((item) => item.display.title).filter(Boolean))];
  const numbersBySeries = displayNumbersByKey(gcdRows, (item) => item._series_gcd_id);
  const numbersByTitle = displayNumbersByKey(gcdRows, (item) => item.display.title);
  const [idCovers, titleCovers] = await Promise.all([
    readBatches(coverBatches(seriesIds, numbersBySeries), ({ group, numbers }) => supabase
      .from("canonical_covers")
      .select("id, series_gcd_id, issue_number, series_year, cover_date, storage_path")
      .in("series_gcd_id", group)
      .in("issue_number", numbers)
      .not("storage_path", "is", null)),
    readBatches(coverBatches(titles, numbersByTitle), ({ group, numbers }) => supabase
      .from("canonical_covers")
      .select("id, series_title, issue_number, series_year, cover_date, storage_path")
      .in("series_title", [...new Set(group.flatMap(titleVariants))])
      .in("issue_number", numbers)
      .not("storage_path", "is", null)),
  ]);
  const bySeries = new Map();
  const byTitle = new Map();
  for (const cover of idCovers) {
    const key = `${cover.series_gcd_id}::${norm(cover.issue_number)}`;
    if (!bySeries.has(key)) bySeries.set(key, []);
    bySeries.get(key).push(cover);
  }
  for (const cover of titleCovers) {
    const key = `${normTitle(cover.series_title)}::${norm(cover.issue_number)}`;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(cover);
  }

  const pathById = new Map();
  for (const item of gcdRows) {
    const number = norm(item.display.issueNumber);
    const idKey = `${item._series_gcd_id}::${number}`;
    const titleKey = `${normTitle(item.display.title)}::${number}`;
    const path = pickStoragePath(bySeries.get(idKey), item.display.year, item._series_year_start, item._series_year_end)
      ?? pickStoragePath(byTitle.get(titleKey), item.display.year, item._series_year_start, item._series_year_end);
    if (path) pathById.set(item.id, path);
  }

  const blanks = gcdRows.filter((item) => !pathById.has(item.id));
  if (blanks.length) {
    const resolved = await resolveCovers(supabase, blanks.map((item) => ({
      gcd_issue_id: item.gcd_issue_id,
      series_gcd_id: item._series_gcd_id,
      series_title: item.display.title,
      issue_number: item.display.issueNumber,
      year: item.display.year,
      series_year_start: item._series_year_start,
      series_year_end: item._series_year_end,
      publisher: item.display.publisher,
    }))).catch((error) => {
      console.error("public-profile: shared cover fallback failed", error?.message);
      return new Map();
    });
    for (const item of blanks) {
      const path = resolved.get(item.gcd_issue_id)?.storage_path;
      if (path) pathById.set(item.id, path);
    }
  }

  // Local-only cover lookups use the same title and issue-number batching as
  // GCD rows. One unbounded pair of in() clauses used to produce a 400 for
  // large hand-entered collections.
  const localRows = rows.filter((item) => item.gcd_issue_id == null);
  const localTitles = [...new Set(localRows.map((item) => item.display.title).filter(Boolean))];
  const localNumbers = displayNumbersByKey(localRows, (item) => item.display.title);
  const localCovers = await readBatches(coverBatches(localTitles, localNumbers), ({ group, numbers }) => supabase
    .from("canonical_covers")
    .select("id, series_title, issue_number, series_year, cover_date, storage_path")
    .in("series_title", [...new Set(group.flatMap(titleVariants))])
    .in("issue_number", numbers)
    .not("storage_path", "is", null));
  const localByKey = new Map();
  for (const cover of localCovers) {
    const key = `${normTitle(cover.series_title)}::${norm(cover.issue_number)}`;
    if (!localByKey.has(key)) localByKey.set(key, []);
    localByKey.get(key).push(cover);
  }
  for (const item of localRows) {
    const key = `${normTitle(item.display.title)}::${norm(item.display.issueNumber)}`;
    const path = pickStoragePath(localByKey.get(key), item.display.year, null, null);
    if (path) pathById.set(item.id, path);
  }

  return rows.map((item) => {
    const canonicalPath = pathById.get(item.id);
    const display = {
      ...item.display,
      canonicalCoverUrl: canonicalPath ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${canonicalPath}` : null,
      personalCoverUrl: item._user_cover_path ? `${supabaseUrl}/storage/v1/object/public/comic-covers/${item._user_cover_path}` : null,
      communityCoverUrl: item._community_cover_path ? `${supabaseUrl}/storage/v1/object/public/comic-covers/${item._community_cover_path}` : null,
    };
    return {
      id: item.id,
      status: item.status,
      condition: item.condition,
      grade_numeric: item.grade_numeric,
      slab_company: item.slab_company,
      purchase_price: item.purchase_price,
      market_value: item.market_value,
      created_at: item.created_at,
      gcd_issue_id: item.gcd_issue_id,
      variant_label: item.variant_label,
      copy_number: item.copy_number,
      open_to_trade: item.open_to_trade,
      ...(item.status === "for_sale" ? { listing_id: item.listing_id, listing_price: item.listing_price } : {}),
      display,
      key_issue: item.key_issue,
    };
  });
}

function defaultTabFor(visibility) {
  if (visibility.collection) return "owned";
  if (visibility.wantlist) return "wishlist";
  if (visibility.for_sale) return "for_sale";
  return "owned";
}

export async function GET(req) {
  const timing = createServerTiming();
  for (const phase of ["auth", "profile", "collection", "covers", "series_publishers", "listings", "key_issues", "values", "serialization"]) timing.set(phase);
  let hasVerifiedViewer = false;
  const json = (body, init) => {
    const response = timing.measureSync("serialization", () => NextResponse.json(body, init));
    response.headers.set("Cache-Control", hasVerifiedViewer ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300");
    response.headers.set("Vary", "Authorization");
    response.headers.set("Server-Timing", timing.header());
    return response;
  };

  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  if (!username) return json({ error: "Username required" }, { status: 400 });
  const supabase = getServiceClient();
  const [authedViewer, profileResult] = await Promise.all([
    timing.measure("auth", () => getAuthedUser(req)),
    timing.measure("profile", () => supabase.from("profiles")
      .select("id, username, is_public, avatar_key, avatar_url, is_founding_collector, is_pro, membership_tier, is_patron, created_at, display_name, location, bio, website_url, show_collection, show_wantlist, show_for_sale, show_value, showcase_badges")
      .eq("username", username).single()),
  ]);
  hasVerifiedViewer = Boolean(authedViewer?.id);
  const profile = profileResult.data;
  if (profileResult.error || !profile) return json({ error: "Not found" }, { status: 404 });

  const viewerId = authedViewer?.id ?? null;
  const ownerViewer = Boolean(viewerId && viewerId === profile.id);
  let privateMemberViewer = false;
  if (!ownerViewer && !profile.is_public && canSeePrivateMembers(viewerId)) {
    if (viewerId === ADMIN_ID && aalFromToken(bearerToken(req)) !== "aal2") {
      return json({ error: "Two-factor sign-in required.", mfa_required: true }, { status: 401 });
    }
    privateMemberViewer = true;
  }
  if (!profileResponseAllowed({ isPublic: profile.is_public, ownerViewer, privateMemberViewer })) {
    return json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = ownerViewer || privateMemberViewer;
  const visibility = {
    collection: isOwner || profile.show_collection !== false,
    wantlist: isOwner || profile.show_wantlist !== false,
    for_sale: isOwner || profile.show_for_sale !== false,
    value: isOwner || profile.show_value !== false,
  };
  let loaded;
  try {
    loaded = await timing.measure("collection", () => getProfileIndex(profile.id, visibility, Boolean(profile.is_public && !isOwner)));
  } catch (error) {
    console.error("public profile collection lookup failed:", error?.code, error?.message);
    return json({ error: "Failed to load collection" }, { status: 500 });
  }

  const query = parsePublicProfileQuery(searchParams, defaultTabFor(visibility));
  const result = queryPublicProfileRows(loaded.rows, query);
  const highlights = selectPublicProfileHighlights(loaded.rows);
  const requestedRows = [...new Map([
    ...result.items,
    ...highlights.topShelf,
    ...highlights.recentlyAdded,
    ...highlights.activity,
  ].map((item) => [item.id, item])).values()];
  let enriched;
  try {
    enriched = await timing.measure("covers", () => resolvePageItems(supabase, requestedRows));
  } catch (error) {
    console.error("public profile page enrichment failed:", error?.code, error?.message);
    return json({ error: "Failed to load books" }, { status: 502 });
  }
  const enrichedById = new Map(enriched.map((item) => [item.id, item]));
  const toEnriched = (items) => items.map((item) => enrichedById.get(item.id)).filter(Boolean);
  const summary = summarizePublicProfileRows(loaded.rows);
  summary.topShelf = toEnriched(highlights.topShelf);
  summary.recentlyAdded = toEnriched(highlights.recentlyAdded);
  summary.activity = toEnriched(highlights.activity);
  if (!isOwner) {
    summary.insights.costBasis = 0;
    summary.insights.hasCostData = false;
  }
  return json({
    profile,
    visibility,
    collection: toEnriched(result.items),
    summary,
    page: result.page,
    dominantPublisher: summary.dominantPublisher,
    degraded: loaded.degraded,
  });
}
