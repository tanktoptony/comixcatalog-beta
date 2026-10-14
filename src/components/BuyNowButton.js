"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authedFetch } from "@/lib/apiClient";

export default function BuyNowButton({ listingId, totalCents }) {
  const [canBuy, setCanBuy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
        body: JSON.stringify({ listing_id: listingId }),
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

  return (
    <>
      {cancelled && <p className="checkout-note">Checkout cancelled. The book is still here.</p>}
      {canBuy && (
        <div className="buy-now">
          <button type="button" onClick={buy} disabled={busy}>
            {busy
              ? <span className="buy-spinner" aria-label="Starting checkout" />
              : `Buy now · $${(totalCents / 100).toFixed(2)}`}
          </button>
          <small>Secure checkout with Stripe. Pay through ComixCatalog to be covered.</small>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </>
  );
}
