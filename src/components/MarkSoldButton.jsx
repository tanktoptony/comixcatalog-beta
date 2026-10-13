"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import { trackEvent } from "@/lib/analytics";

export default function MarkSoldButton({ collectionItemId, ownerId, className = "library-row-btn", onRecorded, redirectTo, bookTitle, bookCover }) {
  const { user, loading } = useAuth();
  const dialogRef = useRef(null);
  const [salePrice, setSalePrice] = useState(""); const [soldVia, setSoldVia] = useState("offsite");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [recorded, setRecorded] = useState(false);
  const [buyer, setBuyer] = useState(null); const [buyerQuery, setBuyerQuery] = useState(""); const [buyers, setBuyers] = useState([]);
  async function loadBuyers(q = "") { const url = q.trim().length >= 2 ? `/api/members/search?q=${encodeURIComponent(q.trim())}` : "/api/sales/buyer-candidates"; const response = await authedFetch(url); if (response.ok) setBuyers(await response.json()); }
  if (loading || !user || user.id !== ownerId) return null;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { const response = await authedFetch("/api/collection/mark-sold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collectionItemId, salePrice, soldVia, buyerId: buyer?.id || null }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Couldn't record that sale."); if (buyer) trackEvent("sale_transfer_requested"); dialogRef.current?.close(); await onRecorded?.(result); if (redirectTo) { setRecorded(true); window.setTimeout(() => window.location.assign(redirectTo), 1200); } }
    catch (submitError) { setError(submitError.message); } finally { setBusy(false); }
  }
  return <>
    <button type="button" className={className} onClick={() => { dialogRef.current?.showModal(); loadBuyers(); }}>Mark as sold</button>
    <dialog ref={dialogRef} className="mark-sold-dialog" onClose={() => setError("")}><form onSubmit={submit}>
      <div className="mark-sold-heading">{bookCover && <img src={bookCover} alt="" />}<div><span>Record a sale</span><h2>Mark as sold</h2>{bookTitle && <p>{bookTitle}</p>}</div></div>
      <p className="mark-sold-intro">This removes the book from your collection and keeps a private sale record.</p>
      <label className="mark-sold-price-label">Sale price<span className="mark-sold-price"><span>$</span><input name="salePrice" type="number" min="0.01" max="99999999.99" step="0.01" inputMode="decimal" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} required autoFocus /></span></label>
      <fieldset><legend>Sold via</legend><div className="mark-sold-segments"><label className={soldVia === "comixcatalog_message" ? "selected" : ""}><input type="radio" name="soldVia" value="comixcatalog_message" checked={soldVia === "comixcatalog_message"} onChange={(event) => setSoldVia(event.target.value)} /> ComixCatalog</label><label className={soldVia === "offsite" ? "selected" : ""}><input type="radio" name="soldVia" value="offsite" checked={soldVia === "offsite"} onChange={(event) => setSoldVia(event.target.value)} /> Elsewhere</label></div><small>{soldVia === "comixcatalog_message" ? "Choose the member you sold to and we'll ask them to confirm the copy arrived." : "The sale is recorded privately in your sold history."}</small></fieldset>
      <fieldset><legend>Buyer <span>Optional</span></legend>{buyer ? <div className="mark-sold-buyer"><Avatar profile={buyer} width={30} height={30} /><span><b>{buyer.display_name || buyer.username}</b> @{buyer.username}</span><button type="button" onClick={() => setBuyer(null)}>Change</button></div> : <><input className="mark-sold-search" aria-label="Search members" placeholder="Search by username" value={buyerQuery} onChange={(event) => { setBuyerQuery(event.target.value); loadBuyers(event.target.value); }} /><div className="mark-sold-buyers">{buyers.slice(0, 8).map((member) => <button type="button" key={member.id} onClick={() => setBuyer(member)}><Avatar profile={member} width={34} height={34} /><span><b>{member.display_name || member.username}</b><small>@{member.username}</small></span></button>)}</div></>}</fieldset>
      {error && <p className="mark-sold-error" role="alert">{error}</p>}<div className="mark-sold-actions"><button type="button" onClick={() => dialogRef.current?.close()} disabled={busy}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Recording..." : buyer ? `Send to @${buyer.username} to confirm` : "Record sale"}</button></div>
    </form></dialog>{recorded && <div className="sale-toast" role="status">Recorded. Moved to your sold history.</div>}
  </>;
}
