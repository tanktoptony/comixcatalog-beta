"use client";

import { useRef, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";

export default function MarkSoldButton({ collectionItemId, ownerId, className = "library-row-btn", onRecorded, redirectTo }) {
  const { user, loading } = useAuth();
  const dialogRef = useRef(null);
  const [salePrice, setSalePrice] = useState("");
  const [soldVia, setSoldVia] = useState("offsite");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recorded, setRecorded] = useState(false);

  if (loading || !user || user.id !== ownerId) return null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await authedFetch("/api/collection/mark-sold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionItemId, salePrice, soldVia }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn't record that sale.");
      dialogRef.current?.close();
      await onRecorded?.(result);
      if (redirectTo) {
        setRecorded(true);
        window.setTimeout(() => window.location.assign(redirectTo), 1200);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => dialogRef.current?.showModal()}>
        Mark as sold
      </button>
      <dialog ref={dialogRef} className="mark-sold-dialog" onClose={() => setError("")}>
        <form onSubmit={submit}>
          <h2>Mark as sold</h2>
          <p>This removes the book from your collection and keeps a private sale record.</p>
          <label>
            Sale price
            <span className="mark-sold-price"><span>$</span><input name="salePrice" type="number" min="0.01" max="99999999.99" step="0.01" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} required autoFocus /></span>
          </label>
          <fieldset>
            <legend>Where did it sell?</legend>
            <label><input type="radio" name="soldVia" value="comixcatalog_message" checked={soldVia === "comixcatalog_message"} onChange={(e) => setSoldVia(e.target.value)} /> Sold through a ComixCatalog message</label>
            <label><input type="radio" name="soldVia" value="offsite" checked={soldVia === "offsite"} onChange={(e) => setSoldVia(e.target.value)} /> Sold elsewhere</label>
          </fieldset>
          {error && <p className="mark-sold-error" role="alert">{error}</p>}
          <div className="mark-sold-actions">
            <button type="button" onClick={() => dialogRef.current?.close()} disabled={busy}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Recording…" : "Record sale"}</button>
          </div>
        </form>
      </dialog>
      {recorded && <div className="sale-toast" role="status">Recorded. Moved to your sold history.</div>}
    </>
  );
}
