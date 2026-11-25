"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import { getSupabaseClient } from "@/lib/supabase/client";
import { listingName } from "@/lib/marketplaceFormat";

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
const toCents = (value) => Math.round((Number(value) || 0) * 100);

// Buy now for this copy, plus any of the seller's other buyable books in
// the same order. Combined shipping matches order_create_multi: the highest
// single shipping price, plus the seller's extra-book rate for each extra
// book. The server recomputes every amount; this is only the preview.
// `buyable` is the server's answer, so Buy now is in the first HTML for
// everyone; the availability check then confirms it. When checkout won't take
// the copy, `children` shows instead: the listing page's offer-by-message
// block. With Buy now available, the offer link drops to a secondary button
// so the two can't be confused. A signed-out buyer goes to sign in and comes
// back to this listing. The seller sees neither on their own book.
export default function BuyNowButton({
  listingId,
  sellerId,
  buyable = false,
  priced = true,
  shippingSet = true,
  totalCents,
  shippingCents = 0,
  otherListings = [],
  seller,
  additionalShippingCents = 100,
  offerHref,
  offerLabel,
  children,
}) {
  const { user, loading } = useAuth();
  const [canBuy, setCanBuy] = useState(buyable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [cancelled, setCancelled] = useState(false);
  const isOwner = Boolean(user) && user.id === sellerId;
  const viewerId = user?.id ?? null;

  useEffect(() => {
    if (!priced || loading) return;
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
  }, [listingId, priced, loading, viewerId]);

  // Read after mount rather than with useSearchParams, which would drop this
  // block (and Buy now with it) out of the server HTML.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCancelled(new URLSearchParams(window.location.search).get("checkout") === "cancelled");
  }, []);

  async function buy() {
    setBusy(true);
    setError("");
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data?.session) {
        window.location.assign(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`);
        return;
      }
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

  if (isOwner) {
    return (
      <div className="lp-own">
        <p>This is your listing.</p>
        {priced && !shippingSet && (
          <p className="lp-own-warn" role="status">
            {buyable ? "No shipping price is set, so a buyer pays nothing for shipping. " : "No shipping price is set. "}
            Add one, or enter 0 for free shipping.
          </p>
        )}
        <Link href="/library?tab=for_sale" className="lp-cta lp-cta-quiet">
          Edit in your library
        </Link>
      </div>
    );
  }

  return (
    <>
      {cancelled && <p className="checkout-note">Checkout cancelled. The book is still here.</p>}
      {!canBuy && children}
      {canBuy && (
        <div className="buy-now">
          {user && otherListings.length > 0 && (
            <fieldset className="more-from-seller">
              <legend>Add more from @{seller}</legend>
              {otherListings.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) => toggle(item.id, event.target.checked)}
                  />
                  <span>{listingName(item)}</span>
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
          {!loading && !user && <small>Sign in to buy. We&rsquo;ll bring you back to this book.</small>}
          {extras.length > 0 && <small>Includes {dollars(shipping)} combined shipping.</small>}
          {/* The order rules from the Trust page: 3 business days to ship
              (shipBy.js), tracking from a $50 order total (tracking_required_cents),
              and a report from the order if it never arrives or isn't as described. */}
          <ul className="buy-promises">
            <li>Ships within 3 business days{total >= 5000 ? ", with tracking" : ""}</li>
            <li>Covered if it never arrives or isn&rsquo;t as described</li>
            <li>Secure checkout with Stripe</li>
          </ul>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {canBuy && offerHref && (
        <>
          <Link href={offerHref} className="lp-cta lp-cta-quiet">{offerLabel}</Link>
          <p className="lp-fine">Deals made by message are paid outside ComixCatalog and aren&rsquo;t covered by Buy now.</p>
        </>
      )}
    </>
  );
}
