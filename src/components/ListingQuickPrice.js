"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { shippingError, validateListingEdit } from "@/lib/listingEdit";
import { trackEvent } from "@/lib/analytics";

const dollars = (cents) => (cents == null ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0));

const blurOnEnter = (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.currentTarget.blur();
};

export default function ListingQuickPrice({ listing, estimate, onSaved, autoFocus = false }) {
  const [value, setValue] = useState(dollars(listing.price_cents));
  const [shipping, setShipping] = useState(dollars(listing.shipping_cents));
  const [state, setState] = useState("");

  async function save(e) {
    // Moving from price to shipping isn't done yet: save when focus leaves both.
    if (e?.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    const body = {};
    if (value !== dollars(listing.price_cents)) body.price = value;
    if (shipping !== dollars(listing.shipping_cents)) body.shipping = shipping;
    if (Object.keys(body).length === 0) return;
    const check = validateListingEdit(body);
    if (check.error) return setState(check.error);
    const needsShipping = shippingError(check.patch, listing);
    if (needsShipping) return setState(needsShipping);
    setState("Saving...");
    try {
      const res = await authedFetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the price.");
      if ("price" in body && data.listing.price_cents != null) trackEvent("listing_priced");
      setState("Saved");
      window.setTimeout(() => onSaved?.(data.listing), 750);
    } catch (error) {
      setState(error.message);
    }
  }

  return (
    <div className="listing-quick-price" onBlur={save}>
      <label>
        <span>Asking price</span>
        <span className="listing-quick-money"><b>$</b><input autoFocus={autoFocus} inputMode="decimal" value={value} placeholder="Open to offers" onChange={(e) => { setValue(e.target.value); setState(""); }} onKeyDown={blurOnEnter} aria-label="Asking price in US dollars" /></span>
      </label>
      <label>
        <span>Shipping</span>
        <span className="listing-quick-money listing-quick-ship"><b>$</b><input inputMode="decimal" value={shipping} placeholder="0 is free" onChange={(e) => { setShipping(e.target.value); setState(""); }} onKeyDown={blurOnEnter} aria-label="Shipping price in US dollars, 0 for free" /></span>
      </label>
      {listing.price_cents != null && listing.shipping_cents == null && !state && <small className="listing-need-ship">No shipping price yet, so a buyer pays nothing for shipping. Add one.</small>}
      {estimate > 0 && <small>eBay asking-price data: about ${Number(estimate).toFixed(2)}. Enter your own price above.</small>}
      {state && <span className={state === "Saved" ? "listing-save-ok" : "listing-save-state"} role="status">{state}</span>}
    </div>
  );
}
