// Pure helpers for the signed-in homepage's "hunt" sections: the member's
// wantlist (with guide prices and any copy for sale) and a few marketplace
// picks. The route in src/app/api/shelf/hunt does the reads.

import { isUnderGuide } from "./marketplaceDeals.js";

// Collection values switched to PriceCharting on this date (#483). Changes
// measured across it compare two different methods, so the homepage only
// reports a change between snapshots taken on or after it.
export const VALUE_METHOD_SINCE = "2026-11-20";

// latest: { total, snapshot_date }. earlier: { total_value, snapshot_date } or
// null. Returns { amount, since } or null when there is nothing honest to say.
export function valueChange(latest, earlier) {
  if (!latest || !earlier) return null;
  if (earlier.snapshot_date < VALUE_METHOD_SINCE) return null;
  if (earlier.snapshot_date >= latest.snapshot_date) return null;
  const amount = Math.round((Number(latest.total) - Number(earlier.total_value)) * 100) / 100;
  if (!Number.isFinite(amount)) return null;
  return { amount, since: earlier.snapshot_date };
}

// The earliest snapshot worth comparing against: a week back, never before
// the method change.
export function changeWindowStart(today = new Date()) {
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  return weekAgo > VALUE_METHOD_SINCE ? weekAgo : VALUE_METHOD_SINCE;
}

const listingScore = (l) => (l.buyNow ? 8 : 0) + (isUnderGuide(l) ? 4 : 0) + (l.key ? 2 : 0) + (l.price != null ? 1 : 0);

// Up to `limit` listings worth a look, never the viewer's own: Buy now first,
// then under guide, keys, priced, then the highest guide value. Covers only,
// so the row reads as a shelf.
export function marketPicks(listings, viewerId, limit = 6) {
  return (listings ?? [])
    .filter((l) => l.cover && l.sellerId !== viewerId)
    .sort((a, b) => listingScore(b) - listingScore(a) || (b.guide?.value ?? 0) - (a.guide?.value ?? 0))
    .slice(0, limit);
}

// The viewer's own listings: how many are up, priced, and buyable today
// (Buy now needs a price and a condition).
export function sellerSummary(listings, viewerId) {
  const mine = (listings ?? []).filter((l) => viewerId && l.sellerId === viewerId);
  return {
    listed: mine.length,
    priced: mine.filter((l) => l.price != null).length,
    ready: mine.filter((l) => l.buyNow).length,
  };
}

export function marketStats(listings, viewerId) {
  const others = (listings ?? []).filter((l) => l.sellerId !== viewerId);
  return {
    listed: others.length,
    sellers: new Set(others.map((l) => l.sellerId)).size,
    keys: others.filter((l) => l.key).length,
    underGuide: others.filter(isUnderGuide).length,
  };
}

// wanted: [{ gcd_issue_id, base_gcd_issue_id, title, issue_number, cover_url, guide }]
// listingsByBase: Map base id -> listings (other sellers). Copies for sale
// first (cheapest priced copy shown), then the highest guide value.
export function wantlistCards(wanted, listingsByBase, limit = 6) {
  const cards = (wanted ?? []).map((w) => {
    const forSale = listingsByBase.get(Number(w.base_gcd_issue_id)) ?? [];
    const priced = forSale.filter((l) => l.price != null).sort((a, b) => a.price - b.price);
    const best = priced[0] ?? forSale[0] ?? null;
    return {
      ...w,
      for_sale: forSale.length,
      listing: best ? { id: best.id, price: best.price, href: best.listingHref } : null,
    };
  });
  const total = cards.reduce((sum, c) => sum + (c.guide?.value ?? 0), 0);
  return {
    count: cards.length,
    listed: cards.filter((c) => c.for_sale > 0).length,
    guide_total: Math.round(total * 100) / 100,
    priced: cards.filter((c) => c.guide).length,
    items: cards
      .sort((a, b) => (b.for_sale > 0) - (a.for_sale > 0) || (b.guide?.value ?? 0) - (a.guide?.value ?? 0))
      .slice(0, limit),
  };
}
