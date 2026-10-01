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
