// What a seller can change on their own listing, and the rules for it.
// Pure, so the API route and the editor share it and `node --test` covers it.
// Limits mirror the listings table's CHECK constraints (migration 0031):
// price $1 to $100,000, shipping $0 to $1,000, notes up to 2,000 characters.

export const LIMITS = { minPrice: 1, maxPrice: 100000, maxShipping: 1000, maxNotes: 2000 };

// "$1,250.50" / "1250.5" / 1250.5 -> 125050 cents. "" / null -> null.
// Anything else -> NaN so the caller can say what's wrong.
export function toCents(value) {
  if (value == null) return null;
  const s = String(value).trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

// Body from the editor -> { patch } ready for the listings table, or
// { error } with a message a seller can act on. Only known fields pass.
export function validateListingEdit(body) {
  const b = body && typeof body === "object" ? body : {};
  const patch = {};

  if ("price" in b) {
    const c = toCents(b.price);
    if (Number.isNaN(c)) return { error: "Price should be a dollar amount, like 25 or 25.50." };
    if (c != null && (c < LIMITS.minPrice * 100 || c > LIMITS.maxPrice * 100)) {
      return { error: `Price has to be between $${LIMITS.minPrice} and $${LIMITS.maxPrice.toLocaleString("en-US")}.` };
    }
    patch.price_cents = c;
  }

  if ("shipping" in b) {
    const c = toCents(b.shipping);
    if (Number.isNaN(c)) return { error: "Shipping should be a dollar amount, like 5 or 4.50." };
    if (c != null && c > LIMITS.maxShipping * 100) return { error: `Shipping can't be more than $${LIMITS.maxShipping}.` };
    patch.shipping_cents = c;
  }

  if ("acceptsOffers" in b) patch.accepts_offers = Boolean(b.acceptsOffers);
  if ("restored" in b) patch.restored = Boolean(b.restored);
  if ("signed" in b) patch.signed = Boolean(b.signed);

  if ("conditionNotes" in b) {
    const notes = b.conditionNotes == null ? "" : String(b.conditionNotes).trim();
    if (notes.length > LIMITS.maxNotes) return { error: `Condition notes are capped at ${LIMITS.maxNotes.toLocaleString("en-US")} characters.` };
    patch.condition_notes = notes || null;
  }

  // A listing with no price has to take offers, or nobody could buy it.
  if (patch.price_cents === null && patch.accepts_offers === false) {
    return { error: "Without a price, buyers need to be able to make an offer." };
  }

  if (Object.keys(patch).length === 0) return { error: "Nothing to save." };
  return { patch };
}
