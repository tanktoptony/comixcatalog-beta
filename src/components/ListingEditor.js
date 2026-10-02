"use client";

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { validateListingEdit, LIMITS } from "@/lib/listingEdit";
import PhotoManager from "@/components/PhotoManager";

// Seller's listing editor (opened from the library): price, shipping,
// offers, condition notes, restored/signed. Saves through
// PATCH /api/listings/:id; the same rules run here first so mistakes show
// up before the round trip.

const dollars = (cents) => (cents == null ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0));

export default function ListingEditor({ listing, title, estValue, onClose, onSaved }) {
  const [price, setPrice] = useState(dollars(listing.price_cents));
  const [shipping, setShipping] = useState(dollars(listing.shipping_cents));
  const [acceptsOffers, setAcceptsOffers] = useState(listing.accepts_offers !== false);
  const [notes, setNotes] = useState(listing.condition_notes ?? "");
  const [restored, setRestored] = useState(Boolean(listing.restored));
  const [signed, setSigned] = useState(Boolean(listing.signed));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e) {
    e.preventDefault();
    const body = { price, shipping, acceptsOffers, conditionNotes: notes, restored, signed };
    const check = validateListingEdit(body);
    if (check.error) return setError(check.error);
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save your listing.");
      onSaved?.(data.listing);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="le-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="le" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="le-title">
        <div className="le-head">
          <h2 id="le-title">Edit listing</h2>
          <p>{title}</p>
        </div>

        <div className="le-row">
          <label className="le-field">
            <span>Price</span>
            <div className="le-money">
              <em>$</em>
              <input ref={firstField} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={estValue ? String(Math.round(estValue)) : "Offers only"} />
            </div>
            <small>{estValue ? `Est. value $${Math.round(estValue).toLocaleString("en-US")}. Leave blank to take offers only.` : "Leave blank to take offers only."}</small>
          </label>
          <label className="le-field">
            <span>Shipping</span>
            <div className="le-money">
              <em>$</em>
              <input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="Ask" />
            </div>
            <small>US shipping. 0 means free.</small>
          </label>
        </div>

        <label className="le-check">
          <input type="checkbox" checked={acceptsOffers} onChange={(e) => setAcceptsOffers(e.target.checked)} />
          <span>Accept offers</span>
        </label>

        <label className="le-field">
          <span>Condition notes</span>
          <textarea rows={4} maxLength={LIMITS.maxNotes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Spine stress, color breaks, corner wear, Marvel value stamp intact…" />
        </label>

        {listing.collection_id && <PhotoManager collectionId={listing.collection_id} />}

        <div className="le-checks">
          <label className="le-check">
            <input type="checkbox" checked={restored} onChange={(e) => setRestored(e.target.checked)} />
            <span>Restored (pressed or cleaned doesn&rsquo;t count; color touch, tape, trim do)</span>
          </label>
          <label className="le-check">
            <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} />
            <span>Signed</span>
          </label>
        </div>

        {error && <p className="le-error" role="alert">{error}</p>}

        <div className="le-actions">
          <button type="button" className="le-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="le-save" disabled={busy}>
            {busy ? "Saving…" : "Save listing"}
          </button>
        </div>
      </form>
    </div>
  );
}
