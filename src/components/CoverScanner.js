"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import { ownedCopiesFor } from "@/lib/coverScan";
import { createScanInput, emptyScanDetails, reviewRowsToAddPayload, scanInputUsesVision, splitScanBatches } from "@/lib/scanBulk";
import { combineBarcodeParts, createDuplicateDebouncer } from "@/lib/printings";
import ScanDetails from "./ScanDetails";

const STORAGE_KEY = "cover-scan-stack-v1";
const CameraIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>;

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not resize image")), "image/jpeg", 0.85));
}

async function identify(file) {
  const jpeg = await resizeImage(file); const form = new FormData(); form.append("image", jpeg, "cover.jpg");
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await authedFetch("/api/cover-scan", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || "Scan failed"), { data, status: response.status });
      return data;
    } catch (error) { last = error; if (!(error instanceof TypeError) || attempt) throw error; }
  }
  throw last;
}

function SearchPicker({ row, onPick, onClose }) {
  const [query, setQuery] = useState([row.selected?.series_title, row.selected?.issue_number].filter(Boolean).join(" "));
  const [results, setResults] = useState([]), [busy, setBusy] = useState(false);
  async function search(e) { e.preventDefault(); setBusy(true); try { const response = await fetch(`/api/search/comics?q=${encodeURIComponent(query)}&limit=12&offset=0`); const data = await response.json(); setResults(data.comics ?? []); } finally { setBusy(false); } }
  return <div className="scan-search"><form onSubmit={search}><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search catalog" /><button className="scan-btn scan-btn-primary">{busy ? "Searching..." : "Search"}</button><button type="button" className="scan-btn scan-btn-secondary" onClick={onClose}>Close</button></form><div className="scan-search-results">{results.filter((item) => String(item.id).startsWith("gcd-")).map((item) => <button key={item.id} type="button" onClick={() => onPick({ ...item, gcd_issue_id: Number(String(item.id).replace("gcd-", "")), series_title: item.title, issue_number: item.issueNumber, cover_path: item.cover })}><img src={item.cover || "/fallback-cover.png"} alt="" /><span>{item.title} #{item.issueNumber}<small>{[item.publisher, item.year].filter(Boolean).join(" · ")}</small></span></button>)}</div></div>;
}

function PrintingReport({ item, scanId }) {
  const [open, setOpen] = useState(false), [kind, setKind] = useState("variant"), [name, setName] = useState(""), [upc, setUpc] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(null), [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await authedFetch("/api/cover-scan/printing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan_id: scanId, gcd_issue_id: item.gcd_issue_id, kind, printing_name: name, upc }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not send that report.");
      setMessage(data.duplicate ? "You already reported this one." : "Thanks. We'll review it before it appears in the catalog.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  if (message) return <p className="scan-report-done" role="status">{message}</p>;
  if (!open) return <button type="button" className="scan-report-toggle" onClick={() => setOpen(true)}>Different cover or printing?</button>;
  return <form className="scan-report" onSubmit={submit}><label className="scan-report-field">Type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="variant">Variant cover</option><option value="newsstand">Newsstand</option><option value="reprint">Reprint or 2nd print</option><option value="other">Other</option></select></label><label className="scan-report-field">Name <span>(optional)</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cover B, 1:25, 2nd print" maxLength={120} /></label><label className="scan-report-field">UPC <span>(optional)</span><input value={upc} onChange={(e) => setUpc(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={18} /></label><div className="scan-report-actions"><button className="scan-btn scan-btn-primary" disabled={busy}>{busy ? "Sending..." : "Send for review"}</button><button type="button" className="scan-btn scan-btn-secondary" onClick={() => setOpen(false)}>Cancel</button></div>{error && <p className="cover-scan-error">{error}</p>}</form>;
}

function ReviewRow({ row, update, remove, compact = false }) {
  const [searching, setSearching] = useState(false); const selected = row.selected;
  return <article className={`scan-review-row${compact ? " is-compact" : ""}`}>
    <div className="scan-review-covers"><div>{row.photoUrl ? <img src={row.photoUrl} alt="Your scan" /> : row.source === "barcode" ? <div className="scan-photo-missing scan-barcode-card">{row.barcode}</div> : <div className="scan-photo-missing">Photo unavailable</div>}<small>{row.source === "barcode" ? "Barcode" : "Your scan"}</small></div>{selected && <div><img src={selected.cover_path || "/fallback-cover.png"} alt="Matched cover" /><small>Match</small></div>}</div>
    <div className="scan-review-body"><div className="scan-review-heading"><div><span className={`scan-state is-${row.status}`}>{row.status === "identifying" ? "Identifying" : row.status === "matched" ? (row.candidates?.length > 1 ? "Needs a pick" : "Matched") : row.status === "no-match" ? "No match" : "Could not scan"}</span>{selected && <h3>{selected.series_title} #{selected.issue_number}</h3>}{selected && <p>{[selected.publisher, selected.year].filter(Boolean).join(" · ")}</p>}</div>{!compact && <button type="button" className="scan-remove" onClick={remove}>Remove</button>}</div>
      {row.status === "matched" && <>{row.candidates?.length > 1 ? <label className="scan-match-picker">Swap match<select value={selected?.gcd_issue_id ?? ""} onChange={(e) => update({ selected: row.candidates.find((item) => Number(item.gcd_issue_id) === Number(e.target.value)) })}>{row.candidates.map((item) => <option key={item.gcd_issue_id} value={item.gcd_issue_id}>{item.series_title} #{item.issue_number} ({item.year || "year unknown"})</option>)}</select></label> : <button type="button" className="scan-text-button" onClick={() => setSearching(true)}>Search instead</button>}
      {searching && <SearchPicker row={row} onClose={() => setSearching(false)} onPick={(match) => { update({ selected: match, candidates: [...(row.candidates ?? []), match] }); setSearching(false); }} />}
      {!compact && row.owned && <fieldset className="scan-owned-choice"><legend>Already owned</legend><label><input type="radio" checked={row.ownedChoice === "another"} onChange={() => update({ ownedChoice: "another" })} /> Add another copy</label><label><input type="radio" checked={row.ownedChoice === "skip"} onChange={() => update({ ownedChoice: "skip" })} /> Skip</label></fieldset>}
      {!compact && <><ScanDetails value={row.details} onChange={(details) => update({ details })} /><label className="scan-wantlist"><input type="checkbox" checked={row.wantlist} onChange={(e) => update({ wantlist: e.target.checked })} /> Add to wantlist instead</label></>}</>}{row.error && <p className="cover-scan-error">{row.error}</p>}</div>
  </article>;
}

function SingleScan({ user, collections, refreshLibrary, next }) {
  const camera = useRef(null), picker = useRef(null); const [photo, setPhoto] = useState(null), [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null); const [selected, setSelected] = useState(null), [details, setDetails] = useState(emptyScanDetails), [detailsOpen, setDetailsOpen] = useState(false), [wantlist, setWantlist] = useState(false), [ownedChoice, setOwnedChoice] = useState("skip"), [added, setAdded] = useState(false);
  async function scan(file) { if (!file) return; setPhoto(URL.createObjectURL(file)); setBusy(true); setError(null); setResult(null); setAdded(false); try { const data = await identify(file); setResult(data); setSelected(data.candidates?.[0] ?? null); } catch (e) { setError(e.message); setResult(e.data ?? null); } finally { setBusy(false); } }
  const alreadyOwned = selected && ownedCopiesFor(collections, selected.gcd_issue_id).length > 0;
  async function add() { const row = { id: "single", status: "matched", scanId: result.scan_id, selected, details, wantlist, owned: alreadyOwned, ownedChoice }; const items = reviewRowsToAddPayload([row]); if (!items.length) return; const response = await authedFetch("/api/cover-scan/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) }); const data = await response.json(); if (!response.ok) { setError(data.error); return; } await refreshLibrary({ background: true }); setAdded(true); }
  const choose = (e) => { const file = e.target.files?.[0]; e.target.value = ""; scan(file); };
  return <div className="cover-scanner"><div className={`scan-capture${photo ? " has-photo" : ""}`}>{photo ? <figure className="scan-photo"><img src={photo} alt="Your scan" />{busy && <span className="scan-sweep" />}</figure> : <div className="scan-capture-empty"><span className="scan-capture-icon"><CameraIcon /></span><p className="scan-capture-title">Snap the front cover</p></div>}<div className="scan-capture-actions">{user ? <><button className="scan-btn scan-btn-primary" disabled={busy} onClick={() => camera.current?.click()}><CameraIcon />Take a photo</button><button className="scan-btn scan-btn-secondary" disabled={busy} onClick={() => picker.current?.click()}>Choose a photo</button><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={choose} /><input ref={picker} hidden type="file" accept="image/*" onChange={choose} /></> : <Link href={`/signup?next=${next}`} className="scan-btn scan-btn-primary">Sign up to scan</Link>}</div></div>{error && <div className="scan-callout scan-callout-error">{error}</div>}{result?.outcome === "not_in_catalog" && <div className="scan-callout">We don&apos;t have this one yet.{result.free && " It did not count against your daily scans."}</div>}{selected && <section className="scan-single-match"><h2>Best match</h2><ReviewRow compact row={{ status: "matched", selected, candidates: result.candidates, photoUrl: photo }} update={(patch) => patch.selected && setSelected(patch.selected)} />{alreadyOwned && !wantlist && <fieldset className="scan-owned-choice"><legend>Already owned</legend><label><input type="radio" checked={ownedChoice === "another"} onChange={() => setOwnedChoice("another")} /> Add another copy</label><label><input type="radio" checked={ownedChoice === "skip"} onChange={() => setOwnedChoice("skip")} /> Skip</label></fieldset>}<ScanDetails value={details} onChange={setDetails} collapsed={!detailsOpen} onOpen={() => setDetailsOpen(true)} /><label className="scan-wantlist"><input type="checkbox" checked={wantlist} onChange={(e) => setWantlist(e.target.checked)} /> Add to wantlist instead</label><button className="scan-btn scan-btn-primary scan-single-add" onClick={add} disabled={added || (alreadyOwned && !wantlist && ownedChoice === "skip")}>{added ? "Added" : wantlist ? "Add to wantlist" : "Add"}</button><PrintingReport item={selected} scanId={result.scan_id} /></section>}{result?.quota && <p className="scan-quota">{result.quota.remaining} scans left today</p>}</div>;
}

function BulkScan({ collections, refreshLibrary }) {
  const camera = useRef(null), picker = useRef(null), rowsRef = useRef([]), active = useRef(0); const [rows, setRows] = useState([]), [quota, setQuota] = useState(null), [message, setMessage] = useState(null), [adding, setAdding] = useState(false), [resume, setResume] = useState(null), [addedIds, setAddedIds] = useState([]); rowsRef.current = rows;
  const save = useCallback((nextRows) => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextRows.map(({ photoUrl, file, ...row }) => row))); } catch (error) { console.warn("Could not save cover scan session", error); } }, []);
  const changeRows = useCallback((fn) => setRows((current) => { const next = fn(current); save(next); return next; }), [save]);
  const processRow = useCallback(async (row) => { try { const data = await identify(row.file); setQuota(data.quota); if (data.quota?.remaining === 0) setMessage("You have used today's cover scans. New photos will not be queued until the daily reset."); const selected = data.candidates?.[0] ?? null; const owned = selected ? ownedCopiesFor(collections, selected.gcd_issue_id).length > 0 : false; changeRows((all) => all.map((item) => item.id === row.id ? { ...item, file: null, scanId: data.scan_id, status: selected ? "matched" : "no-match", candidates: data.candidates ?? [], selected, extracted: data.extracted, owned, ownedChoice: owned ? "skip" : "another" } : item)); } catch (error) { if (error.status === 429) { setQuota(error.data?.quota ?? { remaining: 0 }); setMessage(error.message); } changeRows((all) => all.map((item) => item.id === row.id ? { ...item, file: null, status: "error", error: error.message } : item)); } finally { active.current -= 1; } }, [changeRows, collections]);
  const pump = useCallback(() => { if (quota?.remaining === 0) return; while (active.current < 3) { const row = rowsRef.current.find((item) => scanInputUsesVision(item) && item.status === "queued" && !item.started); if (!row) break; row.started = true; active.current += 1; processRow(row); } }, [processRow, quota?.remaining]);
  useEffect(() => { pump(); }, [rows, pump]);
  useEffect(() => {
    let cancelled = false;
    authedFetch("/api/cover-scan").then(async (response) => {
      const data = await response.json();
      if (!cancelled && response.ok) setQuota(data.quota);
    }).catch((error) => console.warn("Could not load cover scan quota", error));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { try { const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]"); if (saved.length) setResume(saved.map((row) => row.status === "queued" || row.status === "identifying" ? { ...row, status: "error", error: "This photo had not finished uploading. Scan it again." } : row)); } catch (error) { console.warn("Could not resume cover scan session", error); } }, []);
  function addFiles(files, reopen = false) { if (quota?.remaining === 0) { setMessage("No scans left today. Your current stack is safe here."); return; } const additions = [...files].filter((file) => file.type.startsWith("image/")).map((file) => createScanInput({ source: "photo", file, photoUrl: URL.createObjectURL(file) })); if (!additions.length) return; changeRows((current) => [...current, ...additions]); if (reopen) camera.current?.click(); }
  async function addAll() { const payload = reviewRowsToAddPayload(rows); if (!payload.length) return; setAdding(true); setMessage(null); let added = [], skipped = []; try { for (const items of splitScanBatches(payload)) { const response = await authedFetch("/api/cover-scan/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); added = [...added, ...(data.added ?? [])]; skipped = [...skipped, ...(data.skipped ?? [])]; } await refreshLibrary({ background: true }); trackEvent("scan_bulk_added", { count: added.length }); sessionStorage.removeItem(STORAGE_KEY); setRows([]); setAddedIds(added.map((item) => item.collection_id)); setMessage(`Added ${added.length}. ${skipped.length} skipped.`); } catch (error) { setMessage(error.message); } finally { setAdding(false); } }
  const count = reviewRowsToAddPayload(rows).length;
  return <div className="scan-bulk">{resume && !rows.length && <div className="scan-resume"><strong>Resume your stack ({resume.length} books)</strong><button className="scan-btn scan-btn-primary" onClick={() => { setRows(resume); setResume(null); }}>Resume</button><button className="scan-btn scan-btn-secondary" onClick={() => { sessionStorage.removeItem(STORAGE_KEY); setResume(null); }}>Discard</button></div>}<div className="scan-bulk-capture"><button className="scan-btn scan-btn-primary" onClick={() => camera.current?.click()} disabled={quota?.remaining === 0}><CameraIcon />Scan next cover</button><button className="scan-btn scan-btn-secondary" onClick={() => picker.current?.click()} disabled={quota?.remaining === 0}>Choose photos</button><input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { const files = e.target.files; e.target.value = ""; addFiles(files, true); }} /><input ref={picker} hidden multiple type="file" accept="image/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /><p>{quota ? `${quota.remaining} scans left today` : "Up to 3 covers identify at once"}</p></div>{message && <div className="scan-callout" role="status">{message} {message.startsWith("Added") && <Link href={`/library?added=${encodeURIComponent(addedIds.join(","))}`}>View just-added books</Link>}</div>}{rows.length > 0 && <div className="scan-queue-strip">{rows.map((row, index) => <div key={row.id} className={`is-${row.status}`}>{row.photoUrl ? <img src={row.photoUrl} alt="" /> : <span>#{index + 1}</span>}<small>{row.status === "queued" ? "Identifying" : row.status === "matched" ? (row.candidates?.length > 1 ? "Needs a pick" : "Matched") : "No match"}</small></div>)}</div>}<section className="scan-review-list">{rows.map((row) => <ReviewRow key={row.id} row={{ ...row, status: row.status === "queued" ? "identifying" : row.status }} update={(patch) => changeRows((all) => all.map((item) => item.id === row.id ? { ...item, ...patch, owned: patch.selected ? ownedCopiesFor(collections, patch.selected.gcd_issue_id).length > 0 : item.owned } : item))} remove={() => changeRows((all) => all.filter((item) => item.id !== row.id))} />)}</section>{rows.length > 0 && <div className="scan-bulk-submit"><button className="scan-btn scan-btn-primary" disabled={!count || adding} onClick={addAll}>{adding ? "Adding..." : `Add ${count} ${count === 1 ? "book" : "books"}`}</button></div>}</div>;
}

function BarcodeScan({ collections, refreshLibrary, onPhoto }) {
  const video = useRef(null), stream = useRef(null), decoderControls = useRef(null), photoPicker = useRef(null), photoRow = useRef(null);
  const readWindow = useRef({ values: [], timer: null });
  const duplicate = useRef(createDuplicateDebouncer(3000));
  const [stack, setStack] = useState(false), [rows, setRows] = useState([]), [cameraState, setCameraState] = useState("starting");
  const [message, setMessage] = useState(null), [adding, setAdding] = useState(false), [addedIds, setAddedIds] = useState([]);

  const stopCamera = useCallback(() => {
    decoderControls.current?.stop?.(); decoderControls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const changeRow = useCallback((id, patch) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }, []);

  const handleRead = useCallback(async (values) => {
    const upc = combineBarcodeParts(values);
    if (!upc || duplicate.current(upc)) return;
    navigator.vibrate?.(45);
    const id = crypto.randomUUID();
    const input = { ...createScanInput({ source: "barcode", barcode: upc }), id };
    setRows((current) => stack ? [...current, input] : [input]);
    try {
      const response = await authedFetch("/api/printings/barcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upc }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check that barcode.");
      trackEvent("scan_barcode_read", { matched: data.matched });
      const selected = data.candidates?.[0] ?? null;
      const owned = selected ? ownedCopiesFor(collections, selected.gcd_issue_id).length > 0 : false;
      changeRow(id, { status: selected ? "matched" : "no-match", candidates: data.candidates ?? [], selected, owned, ownedChoice: owned ? "skip" : "another" });
      if (!data.matched) setMessage("We don't have that barcode yet. Snap the cover instead.");
      if (!stack) stopCamera();
    } catch (error) {
      changeRow(id, { status: "error", error: error.message });
    }
  }, [changeRow, collections, stack, stopCamera]);

  const queueRead = useCallback((values) => {
    readWindow.current.values.push(...values);
    if (readWindow.current.timer) return;
    readWindow.current.timer = setTimeout(() => {
      const pending = readWindow.current.values;
      readWindow.current = { values: [], timer: null };
      handleRead(pending);
    }, 1000);
  }, [handleRead]);

  useEffect(() => {
    let cancelled = false, frame;
    async function start() {
      stopCamera(); setCameraState("starting"); setMessage(null);
      if (!navigator.mediaDevices?.getUserMedia) { setCameraState("unavailable"); return; }
      try {
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media; video.current.srcObject = media; await video.current.play(); setCameraState("ready");
        if ("BarcodeDetector" in window) {
          const supported = await window.BarcodeDetector.getSupportedFormats?.() ?? [];
          const wanted = ["upc_a", "ean_13", "ean_5", "upc_e"].filter((format) => !supported.length || supported.includes(format));
          const detector = wanted.length ? new window.BarcodeDetector({ formats: wanted }) : new window.BarcodeDetector();
          const detect = async () => {
            if (cancelled || !video.current) return;
            try {
              const found = await detector.detect(video.current);
              if (found.length) queueRead(found.map((item) => item.rawValue));
            } catch (error) { if (error.name !== "InvalidStateError") console.warn("Barcode detection failed", error); }
            frame = requestAnimationFrame(detect);
          };
          detect();
        } else {
          const [{ BarcodeFormat, BrowserMultiFormatReader }, { DecodeHintType, ResultMetadataType }] = await Promise.all([
            import("@zxing/browser"), import("@zxing/library"),
          ]);
          const hints = new Map([
            [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.UPC_A, BarcodeFormat.EAN_13, BarcodeFormat.UPC_EAN_EXTENSION]],
            [DecodeHintType.ALLOWED_EAN_EXTENSIONS, [2, 5]],
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          decoderControls.current = await reader.decodeFromVideoElement(video.current, (result) => {
            if (result) {
              const extension = result.getResultMetadata()?.get(ResultMetadataType.UPC_EAN_EXTENSION);
              queueRead([result.getText(), extension].filter(Boolean));
            }
          });
        }
      } catch (error) {
        if (error.name === "NotAllowedError" || error.name === "SecurityError") setCameraState("denied");
        else setCameraState("unavailable");
      }
    }
    start();
    return () => {
      cancelled = true; cancelAnimationFrame(frame); stopCamera();
      clearTimeout(readWindow.current.timer); readWindow.current = { values: [], timer: null };
    };
  }, [queueRead, stopCamera]);

  async function scanUnknownCover(file) {
    const id = photoRow.current; photoRow.current = null;
    if (!id || !file) return;
    const photoUrl = URL.createObjectURL(file);
    changeRow(id, { source: "photo", file, photoUrl, status: "identifying", error: null });
    setMessage(null);
    try {
      const data = await identify(file); const selected = data.candidates?.[0] ?? null;
      const owned = selected ? ownedCopiesFor(collections, selected.gcd_issue_id).length > 0 : false;
      changeRow(id, { file: null, scanId: data.scan_id, status: selected ? "matched" : "no-match", candidates: data.candidates ?? [], selected, extracted: data.extracted, owned, ownedChoice: owned ? "skip" : "another" });
    } catch (error) { changeRow(id, { file: null, status: "error", error: error.message }); }
  }

  function snapUnknownCover(id) {
    photoRow.current = id; photoPicker.current?.click();
  }

  async function addAll() {
    const payload = reviewRowsToAddPayload(rows); if (!payload.length) return;
    setAdding(true); setMessage(null); let added = [], skipped = [];
    try {
      for (const items of splitScanBatches(payload)) {
        const response = await authedFetch("/api/cover-scan/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        added = [...added, ...(data.added ?? [])]; skipped = [...skipped, ...(data.skipped ?? [])];
      }
      await refreshLibrary({ background: true }); setRows([]); setAddedIds(added.map((item) => item.collection_id));
      setMessage(`Added ${added.length}. ${skipped.length} skipped.`);
    } catch (error) { setMessage(error.message); } finally { setAdding(false); }
  }
  const count = reviewRowsToAddPayload(rows).length;
  const cameraProblem = cameraState === "denied" ? "Camera access was denied. Allow camera access in your browser settings, or use a photo scan." : cameraState === "unavailable" ? "No camera is available here. You can still scan or choose a cover photo." : null;
  return <div className="scan-barcode"><input ref={photoPicker} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; scanUnknownCover(file); }} /><div className="scan-barcode-flow" role="group" aria-label="Barcode scan flow"><button className={!stack ? "is-active" : ""} onClick={() => setStack(false)}>One book</button><button className={stack ? "is-active" : ""} onClick={() => setStack(true)}>Keep scanning</button></div><div className="scan-viewfinder"><video ref={video} muted playsInline aria-label="Live barcode camera" /><div className="scan-frame" aria-hidden="true" /><p>{cameraState === "starting" ? "Starting camera..." : "Line up the UPC and the small 5-digit block"}</p></div>{cameraProblem && <div className="scan-callout scan-callout-error">{cameraProblem}</div>}<p className="scan-barcode-note">Barcode reads skip cover recognition and do not use your daily scan limit.</p>{message && <div className="scan-callout" role="status">{message} {message.startsWith("Added") && <Link href={`/library?added=${encodeURIComponent(addedIds.join(","))}`}>View just-added books</Link>}</div>} {cameraProblem && <button className="scan-btn scan-btn-secondary scan-photo-fallback" type="button" onClick={() => onPhoto(stack ? "bulk" : "single")}>Use a photo instead</button>} {rows.length > 0 && <div className="scan-queue-strip">{rows.map((row) => <div key={row.id} className={`is-${row.status}`}><span className="scan-barcode-tile">{row.barcode.slice(-5)}</span><small>{row.status === "identifying" ? "Checking" : row.status === "matched" ? "Matched" : "No match"}</small></div>)}</div>}<section className="scan-review-list">{rows.map((row) => <div key={row.id}><ReviewRow row={row} update={(patch) => changeRow(row.id, { ...patch, owned: patch.selected ? ownedCopiesFor(collections, patch.selected.gcd_issue_id).length > 0 : row.owned })} remove={() => setRows((current) => current.filter((item) => item.id !== row.id))} />{row.source === "barcode" && row.status === "no-match" && <button className="scan-btn scan-btn-secondary scan-photo-fallback" type="button" onClick={() => snapUnknownCover(row.id)}>Snap the cover instead</button>}</div>)}</section>{rows.length > 0 && <div className="scan-bulk-submit"><button className="scan-btn scan-btn-primary" disabled={!count || adding} onClick={addAll}>{adding ? "Adding..." : `Add ${count} ${count === 1 ? "book" : "books"}`}</button></div>}</div>;
}

// Hidden until issue_printings has UPCs to match against (it had 0 on
// 2026-10-12, so every read came back "we don't have that barcode yet").
// Turn on with NEXT_PUBLIC_BARCODE_SCAN=on once the GCD barcode backfill lands.
const BARCODE_SCAN_ENABLED = process.env.NEXT_PUBLIC_BARCODE_SCAN === "on";

export default function CoverScanner() { const { user, isAdmin } = useAuth(); const { collections, refreshLibrary } = useLibrary(); const next = encodeURIComponent(usePathname() || "/scan"); const [mode, setMode] = useState("single"); const barcodeAvailable = BARCODE_SCAN_ENABLED || isAdmin; return <div><div className="scan-mode-tabs" role="tablist"><button className={mode === "single" ? "is-active" : ""} onClick={() => setMode("single")}>Single scan</button><button className={mode === "bulk" ? "is-active" : ""} onClick={() => { setMode("bulk"); trackEvent("scan_bulk_started"); }}>Scan a stack</button>{barcodeAvailable && <button className={mode === "barcode" ? "is-active" : ""} onClick={() => setMode("barcode")}>Barcode</button>}</div>{mode === "single" ? <SingleScan user={user} collections={collections} refreshLibrary={refreshLibrary} next={next} /> : mode === "bulk" ? (user ? <BulkScan collections={collections} refreshLibrary={refreshLibrary} /> : <div className="scan-capture"><Link href={`/signup?next=${next}`} className="scan-btn scan-btn-primary">Sign up to scan a stack</Link></div>) : user ? <BarcodeScan collections={collections} refreshLibrary={refreshLibrary} onPhoto={setMode} /> : <div className="scan-capture"><Link href={`/signup?next=${next}`} className="scan-btn scan-btn-primary">Sign up to scan barcodes</Link></div>}</div>; }
