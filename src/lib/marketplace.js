import { unstable_cache, revalidateTag } from "next/cache";
import { avatarForProfile } from "@/lib/defaultAvatar";
import { getServiceClient } from "./supabase/service.js";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { POST as libraryHydratePOST } from "@/app/api/library-hydrate/route";
import { normalizePublisherLabel } from "@/lib/publisher";
import { coverPathFromUrl, toListing } from "@/lib/listingRow";
import { KIND_LABELS, photoUrl } from "@/lib/listingPhotos";
import { formatSellerRating } from "@/lib/feedback";
import { MARKETPLACE_LIVEMODE } from "@/lib/marketplaceStripe";
import { publicCounts } from "@/lib/publicCounts";
import { loadPriceChartingRows, pcValueForIssue } from "@/lib/pcValue";
import { buildPriceGuide } from "@/lib/priceGuide";

// Marketplace v2 read model (migration 0031). Each listed copy is a row in
// `listings` that snapshots the title, issue, publisher, cover and grade, so
// a read is one query on the marketplace_listings view (active listings from
// public sellers) instead of hydrating every for-sale book on every read.
//
// The library still marks books for sale by flipping user_collections.status;
// a trigger turns that into a listing with a SQL-built snapshot. The cover
// and the master publisher label only exist in JS (cover matching lives in
// /api/library-hydrate), so refreshListingSnapshots() fills those in and
// stamps snapshot_refreshed_at. It runs from POST /api/listings/sync right
// after a library change, and as a backstop before every uncached read.
//
// Unpriced listings show the estimated value (seller's value, else the
// eBay-based auto value) and "Make an offer" by message; priced ones can
// also have Buy now (see sellerStanding.js).

export const LISTINGS_TAG = "listings";

async function hydrate(gcdIds) {
  const items = {};
  // The hydrate route handles whole collections; chunk to keep each call
  // inside the function's time budget.
  for (let i = 0; i < gcdIds.length; i += 500) {
    const res = await libraryHydratePOST(
      new Request("http://internal/api/library-hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comic_ids: [], gcd_issue_ids: gcdIds.slice(i, i + 500), collection_grades: [] }),
      })
    );
    if (!res.ok) throw new Error(`library-hydrate returned ${res.status}`);
    Object.assign(items, (await res.json()).items ?? {});
  }
  return items;
}

// Fill cover_path and the normalized publisher for listings whose snapshot
// hasn't been refreshed (new, or relinked to another issue). Pass sellerId
// to limit it to one seller's listings. Returns how many rows it updated.
export async function refreshListingSnapshots({ sellerId, sb = getServiceClient() } = {}) {
  const stale = await fetchAllPages(() => {
    let q = sb
      .from("listings")
      .select("id, gcd_issue_id, series_title, issue_number, release_year, publisher")
      .is("snapshot_refreshed_at", null)
      .in("status", ["draft", "active", "reserved"]);
    if (sellerId) q = q.eq("seller_id", sellerId);
    return q;
  });
  if (stale.length === 0) return 0;

  const items = await hydrate([...new Set(stale.map((r) => Number(r.gcd_issue_id)))]);
  const now = new Date().toISOString();

  // Copies of the same issue get the same snapshot, so update per issue
  // rather than per row (a full-collection listing is thousands of rows).
  const byIssue = new Map();
  for (const r of stale) {
    if (!byIssue.has(r.gcd_issue_id)) byIssue.set(r.gcd_issue_id, []);
    byIssue.get(r.gcd_issue_id).push(r);
  }
  let updated = 0;
  for (const [gcdIssueId, rows] of byIssue) {
    const r = rows[0];
    const item = items[`gcd-${gcdIssueId}`];
    // Keep the SQL snapshot where the hydrate came back empty; still stamp
    // the row so a missing cover doesn't re-hydrate on every read.
    const patch = {
      series_title: item?.title && item.title !== "Untitled" ? item.title : r.series_title,
      issue_number: item?.issueNumber || r.issue_number,
      release_year: item?.year ?? r.release_year,
      publisher: normalizePublisherLabel(item?.publisher ?? r.publisher) ?? item?.publisher ?? r.publisher,
      cover_path: coverPathFromUrl(item?.cover),
      snapshot_refreshed_at: now,
    };
    const ids = rows.map((x) => x.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from("listings").update(patch).in("id", ids.slice(i, i + 200));
      if (error) throw error;
    }
    updated += rows.length;
  }
  return updated;
}

const VIEW_COLUMNS =
  "id, seller_id, collection_id, gcd_issue_id, series_title, issue_number, release_year, publisher, variant_label, cover_path, condition, grade_numeric, slab_company, price_cents, shipping_cents, accepts_offers, market_value, auto_market_value, seller_username, created_at";

// How many wantlists each listed issue is on ("Most wanted" on the
// marketplace landing). Chunked so the id list stays inside a URL.
async function wantCounts(sb, gcdIds) {
  const counts = new Map();
  for (let i = 0; i < gcdIds.length; i += 300) {
    const rows = await fetchAllPages(() =>
      sb
        .from("user_collections")
        .select("id, gcd_issue_id")
        .eq("status", "wishlist")
        .in("gcd_issue_id", gcdIds.slice(i, i + 300))
    );
    for (const r of rows) counts.set(Number(r.gcd_issue_id), (counts.get(Number(r.gcd_issue_id)) ?? 0) + 1);
  }
  return counts;
}

// Privacy-filtered have/want counts (nightly issue_base_stats), shown only
// at 3 or more like the issue page. Keyed by the listed issue id, so a
// variant listing shows none.
async function communityCounts(sb, gcdIds) {
  const counts = new Map();
  for (let i = 0; i < gcdIds.length; i += 300) {
    const rows = await fetchAllPages(() => sb.from("issue_base_stats").select("base_gcd_issue_id, have, want, for_sale, updated_at").in("base_gcd_issue_id", gcdIds.slice(i, i + 300)), "base_gcd_issue_id");
    for (const row of rows) counts.set(Number(row.base_gcd_issue_id), publicCounts(row));
  }
  return counts;
}

async function chunkedRows(ids, read) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 300) rows.push(...await fetchAllPages(() => read(ids.slice(i, i + 300))));
  return rows;
}

async function mapLimit(items, limit, fn) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index], index);
    }
  }));
}

// Seller photos per listed copy, for the "4 photos" note in browse.
async function photoCounts(sb, collectionIds) {
  const counts = new Map();
  for (let i = 0; i < collectionIds.length; i += 300) {
    const rows = await fetchAllPages(() =>
      sb.from("listing_photos").select("id, collection_id").eq("moderation", "ok").in("collection_id", collectionIds.slice(i, i + 300))
    );
    for (const r of rows) counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1);
  }
  return counts;
}

async function computeListings() {
  const sb = getServiceClient();
  await refreshListingSnapshots({ sb });
  const rows = await fetchAllPages(() => sb.from("marketplace_listings").select(VIEW_COLUMNS));
  const listings = rows.map((r) => toListing(r, process.env.NEXT_PUBLIC_SUPABASE_URL));
  const issueIds = [...new Set(listings.map((l) => l.gcdIssueId))];
  const sellerIds = [...new Set(listings.map((l) => l.sellerId).filter(Boolean))];
  const ids = listings.map((l) => l.id);
  let wants = new Map(), community = new Map(), photos = new Map();
  try { wants = await wantCounts(sb, issueIds); } catch (error) { console.error("marketplace want counts failed:", error); }
  try { community = await communityCounts(sb, issueIds); } catch (error) { console.error("marketplace community counts failed:", error); }
  try { photos = await photoCounts(sb, listings.map((l) => l.collectionId)); } catch (error) { console.error("marketplace photo counts failed:", error); }
  for (const l of listings) {
    l.wantCount = wants.get(l.gcdIssueId) ?? 0;
    l.community = community.get(l.gcdIssueId) ?? null;
    l.photoCount = photos.get(l.collectionId) ?? 0;
  }
  try {
    const details = await chunkedRows(ids, (slice) => sb.from("listings").select("id, condition_notes, restored, signed").in("id", slice));
    const byId = new Map(details.map((row) => [row.id, row]));
    for (const l of listings) {
      const detail = byId.get(l.id);
      const note = String(detail?.condition_notes ?? "").trim();
      l.notes = note ? `${note.slice(0, 160)}${note.length > 160 ? "…" : ""}` : null;
      l.restored = Boolean(detail?.restored);
      l.signed = Boolean(detail?.signed);
    }
  } catch (error) { console.error("marketplace listing details failed:", error); }
  try {
    const { rowsByIssue, error } = await loadPriceChartingRows(sb, issueIds);
    if (error) throw error;
    for (const l of listings) {
      const value = pcValueForIssue(rowsByIssue, { gcd_issue_id: l.gcdIssueId, condition: l.condition, grade_numeric: l.grade, slab_company: l.slab });
      l.guide = value?.url ? { value: value.value, url: value.url, grade: value.grade_used } : null;
    }
  } catch (error) { console.error("marketplace price guides failed:", error); }
  try {
    const keys = await chunkedRows(issueIds, (slice) => sb.from("key_issues").select("gcd_issue_id, character, reason, tier").in("gcd_issue_id", slice));
    const byIssue = new Map();
    for (const row of keys) if (!byIssue.has(Number(row.gcd_issue_id))) byIssue.set(Number(row.gcd_issue_id), row);
    for (const l of listings) { const key = byIssue.get(l.gcdIssueId); l.key = key ? { character: key.character, reason: key.reason } : null; }
  } catch (error) { console.error("marketplace key issues failed:", error); }
  try {
    const { data, error } = await sb.rpc("mkt_seller_ratings", { p_sellers: sellerIds });
    if (error) throw error;
    const bySeller = new Map((data ?? []).map((row) => [row.seller_id, row]));
    for (const l of listings) l.sellerRating = formatSellerRating(bySeller.get(l.sellerId));
  } catch (error) { console.error("marketplace seller ratings failed:", error); }
  try {
    const sales = await chunkedRows(sellerIds, (slice) => sb.from("orders").select("id, seller_id").eq("status", "completed").eq("livemode", MARKETPLACE_LIVEMODE).in("seller_id", slice));
    const counts = new Map();
    for (const row of sales) counts.set(row.seller_id, (counts.get(row.seller_id) ?? 0) + 1);
    for (const l of listings) l.sellerSales = counts.get(l.sellerId) ?? 0;
  } catch (error) { console.error("marketplace seller sales failed:", error); }
  try {
    const profiles = await chunkedRows(sellerIds, (slice) => sb.from("profiles").select("id, is_founding_collector, created_at").in("id", slice));
    const bySeller = new Map(profiles.map((row) => [row.id, row]));
    for (const l of listings) { const p = bySeller.get(l.sellerId); l.sellerFounder = Boolean(p?.is_founding_collector); l.sellerSince = p?.created_at ?? null; }
  } catch (error) { console.error("marketplace seller profiles failed:", error); }
  try {
    await mapLimit(listings.filter((l) => l.price != null), 5, async (l) => {
      try {
        const { data, error } = await sb.rpc("mkt_listing_checkout_block", { p_listing: l.id });
        if (error) throw error;
        l.buyNow = data == null;
      } catch (error) {
        l.buyNow = false;
        console.error(`marketplace checkout eligibility failed for ${l.id}:`, error);
      }
    });
  } catch (error) { console.error("marketplace checkout eligibility failed:", error); }
  return listings.sort((a, b) => (b.listedAt ?? "").localeCompare(a.listedAt ?? ""));
}

async function computeListingsForIssue(gcdIssueId) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("marketplace_listings")
    .select(VIEW_COLUMNS)
    .eq("gcd_issue_id", gcdIssueId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const listings = (data ?? []).map((r) => toListing(r, process.env.NEXT_PUBLIC_SUPABASE_URL));
  const usernames = [...new Set(listings.map((listing) => listing.seller).filter(Boolean))];
  if (usernames.length === 0) return listings;
  // Ratings are a nice-to-have: a failure shows the table without them instead of erroring it.
  const { data: profiles, error: profileError } = await sb
    .from("profiles")
    .select("id,username")
    .in("username", usernames);
  if (profileError) {
    console.error("seller rating profile lookup failed:", profileError);
    return listings;
  }
  const ids = (profiles || []).map((profile) => profile.id);
  const { data: ratings, error: ratingError } = await sb.rpc("mkt_seller_ratings", { p_sellers: ids });
  if (ratingError) {
    console.error("seller ratings lookup failed:", ratingError);
    return listings;
  }
  const byId = new Map((ratings || []).map((rating) => [rating.seller_id, rating]));
  const profileByName = new Map((profiles || []).map((profile) => [profile.username, profile.id]));
  return listings.map((listing) => ({
    ...listing,
    sellerRating: formatSellerRating(byId.get(profileByName.get(listing.seller))),
  }));
}

// Every visible listing, newest first, for /marketplace and its API. Cached
// two minutes and dropped early by revalidateListings() on any listing
// change. A failed read throws (never cached) so the page can say so
// instead of showing an empty market.
export const getListings = unstable_cache(computeListings, ["marketplace-listings-v7"], {
  revalidate: 120,
  tags: [LISTINGS_TAG],
});

// "Copies for Sale" on one issue page.
export async function getListingsForIssue(gcdIssueId) {
  const id = Number(gcdIssueId);
  if (!Number.isInteger(id) || id <= 0) return [];
  return unstable_cache(() => computeListingsForIssue(id), ["marketplace-issue-listings", String(id)], {
    revalidate: 120,
    tags: [LISTINGS_TAG],
  })();
}

// Expire cached listings now (route handlers can't use updateTag), so a
// new listing shows on /marketplace on the next request.
export function revalidateListings() {
  revalidateTag(LISTINGS_TAG, { expire: 0 });
}

// One listing for /listing/[id]: everything buyers see, plus the seller's
// public details and their other active listings count. Only listings
// buyers may see (active, reserved or sold, from a public seller) come
// back; anything else is null so the page 404s. Cached under the same tag,
// so an edit shows up on the next load.
async function computeListing(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const sb = getServiceClient();
  const { data: l, error } = await sb
    .from("listings")
    .select(
      "id, seller_id, collection_id, gcd_issue_id, status, series_title, issue_number, release_year, publisher, variant_label, cover_path, condition, grade_numeric, slab_company, slab_cert_number, condition_notes, restored, signed, price_cents, shipping_cents, accepts_offers, created_at, sold_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!l || !["active", "reserved", "sold"].includes(l.status)) return null;

  const [{ data: seller, error: sErr }, { data: uc, error: uErr }, { count: otherCount, error: cErr }, { data: pricedRows, error: pricedError }, { data: sellerAccount }, { count: salesCount }] = await Promise.all([
    sb.from("profiles").select("username, is_public, show_for_sale, created_at, avatar_key, avatar_url, is_founding_collector").eq("id", l.seller_id).maybeSingle(),
    sb.from("user_collections").select("market_value, auto_market_value").eq("id", l.collection_id).maybeSingle(),
    sb.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", l.seller_id).eq("status", "active").neq("id", l.id),
    sb.from("listings").select("id,collection_id,gcd_issue_id,series_title,issue_number,release_year,publisher,variant_label,cover_path,condition,grade_numeric,slab_company,price_cents,shipping_cents,accepts_offers,created_at").eq("seller_id", l.seller_id).eq("status", "active").not("price_cents", "is", null).neq("id", l.id).order("created_at", { ascending: false }).limit(12),
    sb.from("seller_accounts").select("additional_item_shipping_cents").eq("user_id", l.seller_id).maybeSingle(),
    // Completed Buy now sales in this Stripe mode, so test orders never count as
    // real ones. A failed count shows "New seller" rather than failing the page.
    sb.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", l.seller_id).eq("status", "completed").eq("livemode", MARKETPLACE_LIVEMODE),
  ]);
  if (sErr) throw sErr;
  if (uErr) throw uErr;
  if (cErr) throw cErr;
  if (pricedError) throw pricedError;
  // Offer only books checkout will actually take (onboarded seller, photos
  // at $100+, slab certs, new-seller caps): one ineligible book fails the
  // whole multi-book order.
  const buyable = [];
  // Same series first: someone buying X-Men #18 most likely wants #19.
  const sameSeriesFirst = [...(pricedRows || [])].sort((a, b) => Number(b.series_title === l.series_title) - Number(a.series_title === l.series_title));
  for (const row of sameSeriesFirst) {
    if (buyable.length === 6) break;
    const { data: block, error: blockError } = await sb.rpc("mkt_listing_checkout_block", { p_listing: row.id });
    if (!blockError && block == null) buyable.push(row);
  }
  if (!seller?.username || seller.is_public === false || seller.show_for_sale === false) return null;

  const { data: photoRows, error: pErr } = await sb
    .from("listing_photos")
    .select("id, kind, storage_path, thumb_path, width, height")
    .eq("collection_id", l.collection_id)
    .eq("moderation", "ok")
    .order("sort_order", { ascending: true })
    .limit(20);
  if (pErr) throw pErr;
  const { data: rating, error: ratingError } = await sb.rpc("mkt_seller_rating", { p_seller: l.seller_id });
  // Show the listing without a rating rather than failing the page.
  if (ratingError) console.error("seller rating lookup failed:", ratingError);
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const photos = (photoRows ?? []).map((p) => ({
    id: p.id,
    url: photoUrl(p.storage_path, supa),
    thumbUrl: photoUrl(p.thumb_path, supa),
    label: KIND_LABELS[p.kind] ?? "Photo",
    width: p.width,
    height: p.height,
  }));

  const base = toListing({ ...l, ...(uc ?? {}), seller_username: seller.username }, supa);
  let guide = null, priceGuide = null, key = null, community = null;
  try {
    const { rowsByIssue, error: guideError } = await loadPriceChartingRows(sb, [base.gcdIssueId]);
    if (guideError) throw guideError;
    const value = pcValueForIssue(rowsByIssue, { gcd_issue_id: base.gcdIssueId, condition: base.condition, grade_numeric: base.grade, slab_company: base.slab });
    guide = value?.url ? { value: value.value, url: value.url, grade: value.grade_used } : null;
    priceGuide = buildPriceGuide(rowsByIssue.get(base.gcdIssueId) ?? [], base.gcdIssueId);
  } catch (guideError) { console.error("listing price guide failed:", guideError); }
  try {
    const { data: keyRows, error: keyError } = await sb.from("key_issues").select("gcd_issue_id, character, reason, tier").eq("gcd_issue_id", base.gcdIssueId).limit(1);
    if (keyError) throw keyError;
    const row = keyRows?.[0];
    key = row ? { character: row.character, reason: row.reason } : null;
  } catch (keyError) { console.error("listing key issue failed:", keyError); }
  try { community = (await communityCounts(sb, [base.gcdIssueId])).get(base.gcdIssueId) ?? null; } catch (countError) { console.error("listing community counts failed:", countError); }
  return {
    ...base,
    guide,
    priceGuide,
    key,
    community,
    photos,
    status: l.status,
    certNumber: l.slab_cert_number ?? null,
    notes: l.condition_notes ?? null,
    restored: Boolean(l.restored),
    signed: Boolean(l.signed),
    soldAt: l.sold_at ?? null,
    sellerInfo: {
      id: l.seller_id,
      username: seller.username,
      since: seller.created_at,
      founder: Boolean(seller.is_founding_collector),
      avatar: avatarForProfile({ ...seller, id: l.seller_id }, { width: 88, height: 88 }),
      otherListings: otherCount ?? 0,
      rating: formatSellerRating(rating),
      sales: salesCount ?? 0,
      pricedListings: buyable.map((row) => toListing({ ...row, seller_username: seller.username }, supa)),
      additionalShippingCents: sellerAccount?.additional_item_shipping_cents ?? 100,
    },
  };
}

export async function getListing(id) {
  return unstable_cache(() => computeListing(id), ["marketplace-listing-v3", String(id)], {
    revalidate: 120,
    tags: [LISTINGS_TAG],
  })();
}
