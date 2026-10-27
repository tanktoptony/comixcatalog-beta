export const SELLER_BLOCK_MESSAGES = Object.freeze({
  not_active: "This listing is not active.",
  not_priced: "Add a price before buyers can check out.",
  seller_not_onboarded: "Set up payouts before buyers can check out.",
  seller_restricted: "Checkout is paused for this seller account.",
  needs_condition: "Add the book's condition before buyers can check out.",
  slab_needs_cert: "Add the slab certification number for checkout.",
  needs_photos: "Add front and back photos for a book priced at $100 or more.",
  new_seller_price_cap: "New sellers can list checkout items up to $1,000.",
  new_seller_listing_cap: "New sellers can have up to 25 priced checkout listings.",
  new_seller_open_order_cap: "This sale would put your open orders over the $2,000 new seller limit.",
});

export function sellerBlockMessage(code) {
  return code == null ? "Buyers can check out on this one." : SELLER_BLOCK_MESSAGES[code] || "Checkout is not available for this listing yet.";
}

export function sellerStatusSummary(row) {
  if (!row) return { state: "not_started", label: "Set up payouts", detail: "Connect Stripe so ComixCatalog can send your sale proceeds to your bank." };
  if (row.tier === "limited" || row.tier === "suspended") return { state: "restricted", label: "Checkout paused", detail: "Your seller account cannot accept checkout orders right now." };
  if (row.charges_enabled && row.details_submitted && row.payouts_enabled) return { state: "ready", label: "You're set up", detail: "Stripe can accept payments and send payouts for your sales." };
  return { state: "pending", label: "Finish payout setup", detail: "Stripe still needs a few details before you can accept checkout orders." };
}
