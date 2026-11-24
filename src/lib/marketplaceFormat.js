import { issueNumberText } from "./issueNumberLabel.js";
// Display helpers shared by the marketplace grid and the issue page's
// "For sale" section. Pure, so they work on the server and in the browser.

export function conditionLabel(l) {
  if (l.slab && l.grade != null) return `${l.slab} ${l.grade.toFixed(1)}`;
  if (l.grade != null) return `Raw ${l.grade.toFixed(1)}`;
  return l.condition || "Ungraded";
}

// What goes after the series title: "#4" for a comic, "Vol. 4 TPB" for the
// fourth trade (l.format is the collected edition tag from GCD, null for
// single issues). A trade numbered "#4" reads as the comic.
export function listingNumber(l) {
  if (!l?.format) return issueNumberText(l?.issueNumber);
  const number = issueNumberText(l.issueNumber).replace(/^#/, "");
  // GCD also numbers trades "1 - The Book of Certain Doom".
  const volumeNo = /^(\d+)(?:\s+-\s.*)?$/.exec(number)?.[1];
  const volume = !number ? "" : volumeNo ? `Vol. ${volumeNo}` : `#${number}`;
  // "Saga Omnibus Vol. 1", never "Saga Omnibus Vol. 1 Omnibus".
  const tag = l.format === "Collected" ? "collected edition" : l.format;
  const named = String(l.title ?? "").toLowerCase().includes(tag.toLowerCase());
  return [volume, named ? "" : tag].filter(Boolean).join(" ");
}

export function listingName(l) {
  return [l.title, listingNumber(l)].filter(Boolean).join(" ");
}

// "Make an offer" opens a message thread with the seller, pre-filled with
// the book in question.
export function offerHref(l) {
  const about = `${listingName(l)}${l.year ? ` (${l.year})` : ""}`;
  return `/inbox/${encodeURIComponent(l.seller)}?about=${encodeURIComponent(about)}`;
}

// Always to the cent: a $4.05 book shown as "$4" costs more at checkout than
// the page said.
export function formatValue(v) {
  return v == null ? null : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// "+ $5.00 shipping", "Free shipping", or null when the seller hasn't said.
export function shippingLabel(l) {
  if (l.shipping == null) return null;
  return l.shipping === 0 ? "Free shipping" : `+ ${formatValue(l.shipping)} shipping`;
}

// The button a buyer sees: offers on, or just a message to the seller.
export function contactLabel(l) {
  return l.acceptsOffers === false ? "Message seller" : "Make an offer";
}
