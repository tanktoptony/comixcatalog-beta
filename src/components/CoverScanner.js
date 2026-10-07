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
// an offer to use the photo, not a duplicate warning. `photo` is the person's
// own scan, shown beside the question so "your photo" is never ambiguous next
// to our stock cover on the card.
function OwnedActions({ item, copies, scanId, justAdded, photo, addAnotherCopy, refreshLibrary }) {
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
  const thumb = photo && <img className="cover-scan-owned-thumb" src={photo} alt="Your scan" />;
  if (savedCopy) return <div className="comic-card-actions"><div className="cover-scan-owned-ask">{thumb}<p>Done. Your photo is now the cover for copy {savedCopy}.</p></div><Link href={`/issue/gcd-${item.gcd_issue_id}`}>View issue</Link></div>;
  if (justAdded) return <div className="comic-card-actions">
    <div className="cover-scan-owned-ask">{thumb}<p>Added. Use your photo as its cover?</p></div>
    <button className="comic-btn" disabled={busy} onClick={() => attach(copies.at(-1))}>Use my photo</button>
    <button className="comic-btn" disabled={busy} onClick={() => setDismissed(true)}>No thanks</button>
    {error && <p className="cover-scan-error">{error}</p>}
  </div>;
  return <div className="comic-card-actions">
    <div className="cover-scan-owned-ask">{thumb}<p><strong>You already have {item.title} #{item.issueNumber}.</strong> {picking && copies.length > 1 ? "Which copy gets your photo?" : "Use your photo as the cover for your copy? It replaces our stock cover on your shelf and profile."}</p></div>
    {picking && copies.length > 1 ? copies.map((copy) => <button key={copy.id} className="comic-btn" disabled={busy} onClick={() => attach(copy)}>{ownedCopyLabel(copy)}</button>) : <button className="comic-btn" disabled={busy} onClick={() => copies.length > 1 ? setPicking(true) : attach(copies[0])}>Use my photo</button>}
    <button className="comic-btn" disabled={busy} onClick={anotherCopy}>It&apos;s another copy</button>
    <button className="comic-btn" disabled={busy} onClick={() => setDismissed(true)}>Never mind</button>
    {error && <p className="cover-scan-error">{error}</p>}
  </div>;
}

const CameraIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"></path><circle cx="12" cy="13.5" r="3.5"></circle></svg>;
const LockIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>;

export default function CoverScanner() {
  const { user } = useAuth(); const camera = useRef(null), picker = useRef(null);
  const { collections, addAnotherCopy, refreshLibrary } = useLibrary();
  // Signed-out visitors sign up and come back to the page they started on.
  const next = encodeURIComponent(usePathname() || "/scan");
  const [preview, setPreview] = useState(null), [loading, setLoading] = useState(false), [result, setResult] = useState(null), [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  // Which matches were already owned when the photo was scanned, so a book
  // added from these results isn't then greeted with "You already have it".
  const [ownedAtScan, setOwnedAtScan] = useState(() => new Set());
  async function scan(file) {
    if (!file || loading) return;
    if (!file.type.startsWith("image/")) { setError("That isn't an image. Choose a photo of the cover."); return; }
    setPreview(URL.createObjectURL(file)); setLoading(true); setError(null); setResult(null);
    try {
      const jpeg = await resizeImage(file); const form = new FormData(); form.append("image", jpeg, "cover.jpg");
      const response = await authedFetch("/api/cover-scan", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || "Scan failed"), { data });
      setOwnedAtScan(new Set((data.candidates ?? []).filter((row) => ownedCopiesFor(collections, row.gcd_issue_id).length > 0).map((row) => Number(row.gcd_issue_id))));
      setResult(data);
    } catch (e) { setError(e.message); setResult(e.data ?? null); } finally { setLoading(false); }
  }
  function choose(event) { const file = event.target.files?.[0]; event.target.value = ""; scan(file); }
  // Desktop: drop a photo straight onto the capture area.
  const dropProps = user ? {
    onDragOver: (e) => { e.preventDefault(); setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => { e.preventDefault(); setDragging(false); scan(e.dataTransfer.files?.[0]); },
  } : {};
  async function record(item) { if (!result?.scan_id) return; try { await authedFetch("/api/cover-scan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan_id: result.scan_id, gcd_issue_id: item.gcd_issue_id }) }); } catch (e) { console.error("Could not record cover scan choice", e); } }
  const items = (result?.candidates ?? []).map((row) => ({ ...row, title: row.series_title, issueNumber: row.issue_number, cover: row.cover_path || preview, coverCaption: row.cover_path ? null : "Your photo" }));
  const ex = result?.extracted;
  const read = ex?.is_comic_cover ? [ex.series_title, ex.issue_number && `#${ex.issue_number}`, ex.publisher, ex.cover_year].filter(Boolean) : [];
  return <div className="cover-scanner">
    <div className={`scan-capture${dragging ? " is-dragging" : ""}${preview ? " has-photo" : ""}`} {...dropProps}>
      {preview
        ? <figure className="scan-photo"><img src={preview} alt="Your scan" />{loading && <span className="scan-sweep" aria-hidden="true"></span>}</figure>
        : <div className="scan-capture-empty"><span className="scan-capture-icon"><CameraIcon /></span><p className="scan-capture-title">Snap the front cover</p><p className="scan-capture-hint">{user ? "or drop a photo here" : "Free with an account"}</p></div>}
      <div className="scan-capture-actions">
        {user ? <>
          <button type="button" className="scan-btn scan-btn-primary" onClick={() => camera.current?.click()} disabled={loading}><CameraIcon />{preview ? "Scan another" : "Take a photo"}</button>
          <button type="button" className="scan-btn scan-btn-secondary" onClick={() => picker.current?.click()} disabled={loading}>Choose a photo</button>
          <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={choose} />
          <input ref={picker} hidden type="file" accept="image/*" onChange={choose} />
        </> : <Link href={`/signup?next=${next}`} className="scan-btn scan-btn-primary"><CameraIcon />Sign up to scan</Link>}
      </div>
      {loading && <p role="status" className="scan-status">Reading the cover...</p>}
    </div>
    <p className="scan-privacy"><LockIcon />Photos are saved privately to improve matching.</p>
    {error && <div className="scan-callout scan-callout-error" role="alert">{error}</div>}
    {read.length > 0 && <div className="scan-read"><span className="scan-read-label">We read</span>{read.map((part) => <span key={part} className="scan-read-chip">{part}</span>)}</div>}
    {result?.outcome === "not_in_catalog" && <div className="scan-callout"><strong>We don&apos;t have this one yet.</strong> We&apos;ve noted it so it can be added to the catalog.</div>}
    {result?.outcome === "not_a_comic" && <div className="scan-callout"><strong>That doesn&apos;t look like a comic cover.</strong> Try again with the whole front cover in frame.</div>}
    {items.length > 0 && <section className="scan-results"><h2 className="scan-results-title">Best matches</h2><div className="comic-grid">{items.map((item, i) => {
      const copies = ownedCopiesFor(collections, item.gcd_issue_id);
      return <ComicResultCard key={item.id} item={item} index={i} query="cover scan" coverCaption={item.coverCaption} onMutationError={setError} onChosen={record} hideActions={copies.length > 0} actionContent={copies.length > 0 ? <OwnedActions item={item} copies={copies} scanId={result.scan_id} justAdded={!ownedAtScan.has(Number(item.gcd_issue_id))} photo={preview} addAnotherCopy={addAnotherCopy} refreshLibrary={refreshLibrary} /> : null} />;
    })}</div></section>}
    {result?.quota && <p className="scan-quota">{result.quota.remaining} of {result.quota.limit} scans left today</p>}
  </div>;
}
