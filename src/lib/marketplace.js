import { unstable_cache, revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { POST as libraryHydratePOST } from "@/app/api/library-hydrate/route";
import { normalizePublisherLabel } from "@/lib/publisher";
import { coverPathFromUrl, toListing } from "@/lib/listingRow";

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
// There is still no checkout: buyers see the estimated value (seller's
// value, else the eBay-based auto value) and "Make an offer" by message.

export const LISTINGS_TAG = "listings";

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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
export async function refreshListingSnapshots({ sellerId, sb = client() } = {}) {
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
  "id, collection_id, gcd_issue_id, series_title, issue_number, release_year, publisher, variant_label, cover_path, condition, grade_numeric, slab_company, price_cents, shipping_cents, accepts_offers, market_value, auto_market_value, seller_username, created_at";

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

async function computeListings() {
  const sb = client();
  await refreshListingSnapshots({ sb });
  const rows = await fetchAllPages(() => sb.from("marketplace_listings").select(VIEW_COLUMNS));
  const listings = rows.map((r) => toListing(r, process.env.NEXT_PUBLIC_SUPABASE_URL));
  const wants = await wantCounts(sb, [...new Set(listings.map((l) => l.gcdIssueId))]);
  for (const l of listings) l.wantCount = wants.get(l.gcdIssueId) ?? 0;
  return listings.sort((a, b) => (b.listedAt ?? "").localeCompare(a.listedAt ?? ""));
}

async function computeListingsForIssue(gcdIssueId) {
  const sb = client();
  const { data, error } = await sb
    .from("marketplace_listings")
    .select(VIEW_COLUMNS)
    .eq("gcd_issue_id", gcdIssueId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => toListing(r, process.env.NEXT_PUBLIC_SUPABASE_URL));
}

// Every visible listing, newest first, for /marketplace and its API. Cached
// two minutes and dropped early by revalidateListings() on any listing
// change. A failed read throws (never cached) so the page can say so
// instead of showing an empty market.
export const getListings = unstable_cache(computeListings, ["marketplace-listings-v5"], {
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
  const sb = client();
  const { data: l, error } = await sb
    .from("listings")
    .select(
      "id, seller_id, collection_id, gcd_issue_id, status, series_title, issue_number, release_year, publisher, variant_label, cover_path, condition, grade_numeric, slab_company, slab_cert_number, condition_notes, restored, signed, price_cents, shipping_cents, accepts_offers, created_at, sold_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!l || !["active", "reserved", "sold"].includes(l.status)) return null;

  const [{ data: seller, error: sErr }, { data: uc, error: uErr }, { count: otherCount, error: cErr }] = await Promise.all([
    sb.from("profiles").select("username, is_public, show_for_sale, created_at, avatar_key, avatar_url, is_founding_collector").eq("id", l.seller_id).maybeSingle(),
    sb.from("user_collections").select("market_value, auto_market_value").eq("id", l.collection_id).maybeSingle(),
    sb.from("listings").select("id", { count: "exact", head: true }).eq("seller_id", l.seller_id).eq("status", "active").neq("id", l.id),
  ]);
  if (sErr) throw sErr;
  if (uErr) throw uErr;
  if (cErr) throw cErr;
  if (!seller?.username || seller.is_public === false || seller.show_for_sale === false) return null;

  const base = toListing({ ...l, ...(uc ?? {}), seller_username: seller.username }, process.env.NEXT_PUBLIC_SUPABASE_URL);
  return {
    ...base,
    status: l.status,
    certNumber: l.slab_cert_number ?? null,
    notes: l.condition_notes ?? null,
    restored: Boolean(l.restored),
    signed: Boolean(l.signed),
    soldAt: l.sold_at ?? null,
    sellerInfo: {
      username: seller.username,
      since: seller.created_at,
      founder: Boolean(seller.is_founding_collector),
      avatar: seller.avatar_url || `/avatars/${seller.avatar_key || "cc_badge"}.png`,
      otherListings: otherCount ?? 0,
    },
  };
}

export async function getListing(id) {
  return unstable_cache(() => computeListing(id), ["marketplace-listing", String(id)], {
    revalidate: 120,
    tags: [LISTINGS_TAG],
  })();
}
