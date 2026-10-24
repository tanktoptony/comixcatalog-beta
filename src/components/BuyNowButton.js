"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authedFetch } from "@/lib/apiClient";

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
const toCents = (value) => Math.round((Number(value) || 0) * 100);

// Buy now for this copy, plus any of the seller's other buyable books in
// the same order. Combined shipping matches order_create_multi: the highest
// single shipping price, plus the seller's extra-book rate for each extra
// book. The server recomputes every amount; this is only the preview.
export default function BuyNowButton({
  listingId,
  totalCents,
  shippingCents = 0,
  otherListings = [],
  seller,
  additionalShippingCents = 100,
}) {
  const [canBuy, setCanBuy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const cancelled = useSearchParams().get("checkout") === "cancelled";

  useEffect(() => {
    let live = true;
    authedFetch(`/api/checkout/availability?listing=${listingId}`)
      .then((response) => response.json())
      .then((result) => {
        if (live) setCanBuy(result.canBuy === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [listingId]);

  async function buy() {
    setBusy(true);
    setError("");
    try {
      const response = await authedFetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listing_ids: [listingId, ...selected] }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) {
        throw new Error(result.error || "Checkout could not start");
      }
      window.location.assign(result.url);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  function toggle(id, checked) {
    setSelected((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));
  }

  const extras = otherListings.filter((item) => selected.includes(item.id));
  const shipping = extras.length
    ? Math.max(shippingCents, ...extras.map((item) => toCents(item.shipping))) + additionalShippingCents * extras.length
    : shippingCents;
  const items = totalCents - shippingCents + extras.reduce((sum, item) => sum + toCents(item.price), 0);
  const total = items + shipping;

  return (
    <>
      {cancelled && <p className="checkout-note">Checkout cancelled. The book is still here.</p>}
      {canBuy && (
        <div className="buy-now">
          {otherListings.length > 0 && (
            <fieldset className="more-from-seller">
              <legend>Add more from @{seller}</legend>
              {otherListings.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                  />
                  <span>{item.title}{item.issueNumber ? ` #${item.issueNumber}` : ""}</span>
                  <b>{dollars(toCents(item.price))}</b>
                </label>
              ))}
            </fieldset>
          )}
          <button type="button" onClick={buy} disabled={busy}>
            {busy
              ? <span className="buy-spinner" aria-label="Starting checkout" />
              : extras.length
                ? `Buy ${extras.length + 1} books · ${dollars(total)}`
                : `Buy now · ${dollars(total)}`}
          </button>
          <small>
            {extras.length > 0 && <>Includes {dollars(shipping)} combined shipping. </>}
            Secure checkout with Stripe. Pay through ComixCatalog to be covered.
          </small>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </>
  );
}
