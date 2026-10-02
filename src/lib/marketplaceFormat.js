// Display helpers shared by the marketplace grid and the issue page's
// "For sale" section. Pure, so they work on the server and in the browser.

export function conditionLabel(l) {
  if (l.slab && l.grade != null) return `${l.slab} ${l.grade.toFixed(1)}`;
  if (l.grade != null) return `Raw ${l.grade.toFixed(1)}`;
  return l.condition || "Ungraded";
}

// "Make an offer" opens a message thread with the seller, pre-filled with
// the book in question.
export function offerHref(l) {
  const about = `${l.title}${l.issueNumber ? ` #${l.issueNumber}` : ""}${l.year ? ` (${l.year})` : ""}`;
  return `/inbox/${encodeURIComponent(l.seller)}?about=${encodeURIComponent(about)}`;
}

export function formatValue(v) {
  return v == null ? null : `$${Math.round(v).toLocaleString("en-US")}`;
}

// "+ $5 shipping", "Free shipping", or null when the seller hasn't said.
export function shippingLabel(l) {
  if (l.shipping == null) return null;
  return l.shipping === 0 ? "Free shipping" : `+ $${l.shipping.toLocaleString("en-US", { maximumFractionDigits: 2 })} shipping`;
}

// The button a buyer sees: offers on, or just a message to the seller.
export function contactLabel(l) {
  return l.acceptsOffers === false ? "Message seller" : "Make an offer";
}
