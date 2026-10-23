"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { validateListingEdit, LIMITS } from "@/lib/listingEdit";
import { trackEvent } from "@/lib/analytics";
import ListingQuickPrice from "@/components/ListingQuickPrice";
import PhotoManager from "@/components/PhotoManager";

export default function ListingCompletionPanel({ listing, estimate, onSaved, onPhotoAdded, onClose }) {
  const [notes, setNotes] = useState(listing.condition_notes ?? "");
  const [message, setMessage] = useState("");

  async function done() {
    if (notes !== (listing.condition_notes ?? "")) {
      const check = validateListingEdit({ conditionNotes: notes });
      if (check.error) return setMessage(check.error);
      setMessage("Saving...");
      const res = await authedFetch(`/api/listings/${listing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conditionNotes: notes }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage(data.error || "Couldn't save the condition note.");
      onSaved?.(data.listing);
    }
    onClose();
  }

  return (
    <section className="listing-completion" aria-label="Finish your listing">
      <h3>Finish your listing</h3>
      <p>Priced listings with a photo show on the marketplace front page.</p>
      <ListingQuickPrice listing={listing} estimate={estimate} onSaved={onSaved} autoFocus />
      <div className="listing-completion-photo"><strong>Add a photo of your copy</strong><PhotoManager collectionId={listing.collection_id} onPhotoAdded={() => { trackEvent("listing_photo_added"); onPhotoAdded?.(); }} /></div>
      <label className="listing-completion-note"><span>Condition note</span><textarea rows={3} maxLength={LIMITS.maxNotes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Spine stress, corner wear, color breaks..." /></label>
      {message && <p role="alert" className="listing-save-state">{message}</p>}
      <div className="listing-completion-actions"><button type="button" onClick={onClose}>Later</button><button type="button" className="primary" onClick={done}>Done</button></div>
    </section>
  );
}
