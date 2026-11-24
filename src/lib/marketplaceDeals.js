export function guideDiscount(listing) {
  const price = listing?.price;
  const guide = listing?.guide?.value;
  return price != null && Number(guide) > 0 ? 1 - Number(price) / Number(guide) : null;
}

export function isUnderGuide(listing) {
  const discount = guideDiscount(listing);
  return discount != null && discount >= 0.05;
}

// The asking price is the guide value, to the cent: printing both says the
// same number twice.
export function isAtGuide(listing) {
  const price = listing?.price;
  const guide = listing?.guide?.value;
  return price != null && guide != null && Math.round(Number(price) * 100) === Math.round(Number(guide) * 100);
}

export function totalWithShipping(listing) {
  return listing?.price != null && listing?.shipping != null
    ? Number(listing.price) + Number(listing.shipping)
    : null;
}

export function discountLabel(listing) {
  const discount = guideDiscount(listing);
  return isUnderGuide(listing) ? `${Math.round(discount * 100)}% under guide` : null;
}

// "14 collectors have it · 3 want it" from publicCounts() output (counts
// under 3 are already null there), or null when nothing is shown.
export function communityLine(community) {
  if (!community) return null;
  const parts = [];
  if (community.have) parts.push(`${community.have.toLocaleString("en-US")} collectors have it`);
  if (community.want) parts.push(`${community.want.toLocaleString("en-US")} want it`);
  return parts.length ? parts.join(" · ") : null;
}

// The grade a guide value was read at: "raw" or "9.4".
export function guideGradeLabel(grade) {
  if (!grade) return "raw";
  return grade === "ungraded" ? "raw" : String(grade);
}

// Buyer promises shown on /marketplace and every listing. Each line must
// stay true to the Terms (shipping within 3 business days, tracking at $50,
// reports reviewed before the order completes). Icon names map to lucide
// icons in the components.
export const TRUST_POINTS = [
  ["card", "Secure checkout", "Buy now orders are paid by card through Stripe."],
  ["truck", "Sellers ship within 3 business days", "With tracking on orders of $50 or more."],
  ["shield", "Covered until the order completes", "Not as described or never arrived? Report it from the order page and we review it."],
];
