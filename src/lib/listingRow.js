// Pure helpers for marketplace listings (migration 0031). No Supabase or
// Next imports, so they run under `node --test` and on either side.

const COVER_PREFIX = "/storage/v1/object/public/canonical-covers/";

// /api/library-hydrate hands back full public URLs; listings store the
// canonical-covers storage path so a project URL change can't strand them.
export function coverPathFromUrl(url) {
  if (!url) return null;
  const i = String(url).indexOf(COVER_PREFIX);
  if (i === -1) return null;
  const path = String(url).slice(i + COVER_PREFIX.length);
  return path ? decodeURI(path) : null;
}

export function coverUrlFromPath(path, supabaseUrl) {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl}${COVER_PREFIX}${path}`;
}

// The seller's own value wins, then the eBay-comps auto value. Zero and
// junk mean "no estimate".
export function estValue(row) {
  for (const v of [row.market_value, row.auto_market_value]) {
    const n = Number(v);
    if (v != null && Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// One marketplace_listings view row -> the shape MarketplaceBrowser and
// IssueForSale already render (unchanged from v1 so the UI didn't move).
export function toListing(row, supabaseUrl) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    gcdIssueId: Number(row.gcd_issue_id),
    href: `/issue/gcd-${row.gcd_issue_id}`,
    title: row.series_title || "Untitled",
    issueNumber: row.issue_number ?? "",
    year: row.release_year ?? null,
    publisher: row.publisher ?? null,
    variant: row.variant_label ?? null,
    cover: coverUrlFromPath(row.cover_path, supabaseUrl),
    condition: row.condition ?? null,
    grade: row.grade_numeric != null ? Number(row.grade_numeric) : null,
    slab: row.slab_company ?? null,
    price: row.price_cents != null ? row.price_cents / 100 : null,
    shipping: row.shipping_cents != null ? row.shipping_cents / 100 : null,
    acceptsOffers: row.accepts_offers !== false,
    estValue: estValue(row),
    seller: row.seller_username,
    listedAt: row.created_at,
  };
}
