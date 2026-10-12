"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { validateListingEdit } from "@/lib/listingEdit";
import { trackEvent } from "@/lib/analytics";

const dollars = (cents) => (cents == null ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0));

export default function ListingQuickPrice({ listing, estimate, onSaved, autoFocus = false }) {
  const [value, setValue] = useState(dollars(listing.price_cents));
  const [state, setState] = useState("");

  async function save() {
    if (value === dollars(listing.price_cents)) return;
    const check = validateListingEdit({ price: value });
    if (check.error) return setState(check.error);
    setState("Saving...");
    try {
      const res = await authedFetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the price.");
      if (data.listing.price_cents != null) trackEvent("listing_priced");
      setState("Saved");
      window.setTimeout(() => onSaved?.(data.listing), 750);
    } catch (error) {
      setState(error.message);
    }
  }

  return (
    <div className="listing-quick-price">
      <label>
        <span>Asking price</span>
        <span className="listing-quick-money"><b>$</b><input autoFocus={autoFocus} inputMode="decimal" value={value} placeholder="Open to offers" onChange={(e) => { setValue(e.target.value); setState(""); }} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} aria-label="Asking price in US dollars" /></span>
      </label>
      {estimate > 0 && <small>eBay asking-price data: about ${Number(estimate).toFixed(2)}. Enter your own price above.</small>}
      {state && <span className={state === "Saved" ? "listing-save-ok" : "listing-save-state"} role="status">{state}</span>}
    </div>
  );
}
