"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import ComicResultCard from "./ComicResultCard";

async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not resize image")), "image/jpeg", 0.85));
}

export default function CoverScanner() {
  const { user } = useAuth(); const input = useRef(null);
  const [preview, setPreview] = useState(null), [loading, setLoading] = useState(false), [result, setResult] = useState(null), [error, setError] = useState(null);
  async function choose(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setPreview(URL.createObjectURL(file)); setLoading(true); setError(null); setResult(null);
    try {
      const jpeg = await resizeImage(file); const form = new FormData(); form.append("image", jpeg, "cover.jpg");
      const response = await authedFetch("/api/cover-scan", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || "Scan failed"), { data }); setResult(data);
    } catch (e) { setError(e.message); setResult(e.data ?? null); } finally { setLoading(false); event.target.value = ""; }
  }
  async function record(item) { if (!result?.scan_id) return; try { await authedFetch("/api/cover-scan", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan_id: result.scan_id, gcd_issue_id: item.gcd_issue_id }) }); } catch (e) { console.error("Could not record cover scan choice", e); } }
  const items = (result?.candidates ?? []).map((row) => ({ ...row, title: row.series_title, issueNumber: row.issue_number, cover: row.cover_path }));
  return <div className="cover-scanner">
    {user ? <><button className="comic-btn" onClick={() => input.current?.click()} disabled={loading}>Scan a cover</button><input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={choose} /></> : <Link href="/signup?next=%2Fsearch" className="comic-btn">Scan a cover</Link>}
    <p className="muted cover-scan-notice">Photos are saved to improve matching.</p>
    {preview && <img className="cover-scan-preview" src={preview} alt="Cover preview" />}
    {loading && <p role="status">Reading the cover...</p>}
    {error && <p className="cover-scan-error">{error}</p>}
    {result?.quota && <p className="muted">{result.quota.remaining} of {result.quota.limit} scans left today</p>}
    {result?.outcome === "not_in_catalog" && <p>We don&apos;t have this one yet, we&apos;ve noted it.</p>}
    {result?.outcome === "not_a_comic" && <p>That doesn&apos;t look like a comic cover. Try another photo.</p>}
    {items.length > 0 && <><h2 className="section-label">Best matches</h2><div className="comic-grid">{items.map((item, i) => <ComicResultCard key={item.id} item={item} index={i} query="cover scan" onMutationError={setError} onChosen={record} />)}</div></>}
  </div>;
}
