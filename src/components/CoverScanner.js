"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { authedFetch } from "@/lib/apiClient";
import { ownedCopiesFor, ownedCopyLabel } from "@/lib/coverScan";
import ComicResultCard from "./ComicResultCard";

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not resize image")), "image/jpeg", 0.85));
}

// justAdded: the copy was added from these results after the scan, so this is
// an offer to use the photo, not a duplicate warning.
function OwnedActions({ item, copies, scanId, justAdded, addAnotherCopy, refreshLibrary }) {
  const [busy, setBusy] = useState(false), [picking, setPicking] = useState(false), [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(null), [savedCopy, setSavedCopy] = useState(null);
  async function attach(copy) {
    setBusy(true); setError(null);
    try {
      const response = await authedFetch("/api/cover-scan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan_id: scanId, gcd_issue_id: item.gcd_issue_id, collection_id: copy.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save this photo");
      await refreshLibrary({ background: true }); setSavedCopy(copy.copy_number ?? 1);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function anotherCopy() {
    setBusy(true); setError(null);
    try {
      const added = await addAnotherCopy(`gcd-${item.gcd_issue_id}`);
      if (added?.ok === false || !added?.row) throw new Error(added?.error || "Could not add another copy");
      await attach(added.row);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  if (dismissed) return null;
  if (savedCopy) return <div className="comic-card-actions"><p>Saved. Your photo is now the cover for copy {savedCopy}.</p><Link href={`/issue/gcd-${item.gcd_issue_id}`}>View issue</Link></div>;
  if (justAdded) return <div className="comic-card-actions">
    <p>Added. Use this photo as your cover?</p>
    <button className="comic-btn" disabled={busy} onClick={() => attach(copies.at(-1))}>Use this photo</button>
    <button className="comic-btn" disabled={busy} onClick={() => setDismissed(true)}>No thanks</button>
    {error && <p className="cover-scan-error">{error}</p>}
  </div>;
  return <div className="comic-card-actions">
    <p>You already have {item.title} #{item.issueNumber}.</p>
    {picking && copies.length > 1 ? copies.map((copy) => <button key={copy.id} className="comic-btn" disabled={busy} onClick={() => attach(copy)}>{ownedCopyLabel(copy)}</button>) : <button className="comic-btn" disabled={busy} onClick={() => copies.length > 1 ? setPicking(true) : attach(copies[0])}>Use this photo for my copy</button>}
    <button className="comic-btn" disabled={busy} onClick={anotherCopy}>It&apos;s another copy</button>
    <button className="comic-btn" disabled={busy} onClick={() => setDismissed(true)}>Never mind</button>
    {error && <p className="cover-scan-error">{error}</p>}
  </div>;
}

export default function CoverScanner() {
  const { user } = useAuth(); const input = useRef(null);
  const { collections, addAnotherCopy, refreshLibrary } = useLibrary();
  // Signed-out visitors sign up and come back to the page they started on.
  const next = encodeURIComponent(usePathname() || "/scan");
  const [preview, setPreview] = useState(null), [loading, setLoading] = useState(false), [result, setResult] = useState(null), [error, setError] = useState(null);
  // Which matches were already owned when the photo was scanned, so a book
  // added from these results isn't then greeted with "You already have it".
  const [ownedAtScan, setOwnedAtScan] = useState(() => new Set());
  async function choose(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setPreview(URL.createObjectURL(file)); setLoading(true); setError(null); setResult(null);
    try {
      const jpeg = await resizeImage(file); const form = new FormData(); form.append("image", jpeg, "cover.jpg");
      const response = await authedFetch("/api/cover-scan", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || "Scan failed"), { data });
      setOwnedAtScan(new Set((data.candidates ?? []).filter((row) => ownedCopiesFor(collections, row.gcd_issue_id).length > 0).map((row) => Number(row.gcd_issue_id))));
      setResult(data);
    } catch (e) { setError(e.message); setResult(e.data ?? null); } finally { setLoading(false); event.target.value = ""; }
  }
  async function record(item) { if (!result?.scan_id) return; try { await authedFetch("/api/cover-scan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan_id: result.scan_id, gcd_issue_id: item.gcd_issue_id }) }); } catch (e) { console.error("Could not record cover scan choice", e); } }
  const items = (result?.candidates ?? []).map((row) => ({ ...row, title: row.series_title, issueNumber: row.issue_number, cover: row.cover_path || preview, coverCaption: row.cover_path ? null : "Your photo" }));
  return <div className="cover-scanner">
    {user ? <><button className="comic-btn" onClick={() => input.current?.click()} disabled={loading}>Scan a cover</button><input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={choose} /></> : <Link href={`/signup?next=${next}`} className="comic-btn">Scan a cover</Link>}
    <p className="muted cover-scan-notice">Photos are saved to improve matching.</p>
    {preview && <img className="cover-scan-preview" src={preview} alt="Cover preview" />}
    {loading && <p role="status">Reading the cover...</p>}
    {error && <p className="cover-scan-error">{error}</p>}
    {result?.quota && <p className="muted">{result.quota.remaining} of {result.quota.limit} scans left today</p>}
    {result?.outcome === "not_in_catalog" && <p>We don&apos;t have this one yet, we&apos;ve noted it.</p>}
    {result?.outcome === "not_a_comic" && <p>That doesn&apos;t look like a comic cover. Try another photo.</p>}
    {items.length > 0 && <><h2 className="section-label">Best matches</h2><div className="comic-grid">{items.map((item, i) => {
      const copies = ownedCopiesFor(collections, item.gcd_issue_id);
      return <ComicResultCard key={item.id} item={item} index={i} query="cover scan" coverCaption={item.coverCaption} onMutationError={setError} onChosen={record} hideActions={copies.length > 0} actionContent={copies.length > 0 ? <OwnedActions item={item} copies={copies} scanId={result.scan_id} justAdded={!ownedAtScan.has(Number(item.gcd_issue_id))} addAnotherCopy={addAnotherCopy} refreshLibrary={refreshLibrary} /> : null} />;
    })}</div></>}
  </div>;
}
