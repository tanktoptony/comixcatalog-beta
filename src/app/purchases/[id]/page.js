/* eslint-disable react/no-unescaped-entities */
"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";

export default function PurchasePage({ params }) {
  const { id } = use(params);
  const [purchase, setPurchase] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { authedFetch(`/api/purchases/${id}`, { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setPurchase(b); }).catch((e) => setError(e.message)); }, [id]);
  async function act(action) {
    setBusy(true); setError("");
    try { const r = await authedFetch(`/api/purchases/${id}/${action}`, { method: "POST" }); const b = await r.json(); if (!r.ok) throw new Error(b.error); setPurchase((p) => ({ ...p, status: action === "confirm" ? "confirmed" : "disputed" })); trackEvent(action === "confirm" ? "sale_transfer_confirmed" : "sale_transfer_disputed"); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  if (error && !purchase) return <main className="comic-panel"><h1>Purchase</h1><p className="mark-sold-error">{error}</p></main>;
  if (!purchase) return <main className="comic-panel"><h1>Purchase</h1><p>Loading...</p></main>;
  const photos = Array.isArray(purchase.seller_photo_keys) ? purchase.seller_photo_keys : [];
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-photos/`;
  return <main className="comic-panel purchase-page"><h1>{purchase.series_title}{purchase.issue_number ? ` #${purchase.issue_number}` : ""}</h1><p>Seller: @{purchase.seller?.username || "unknown"}</p><p><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: purchase.currency || "USD" }).format(Number(purchase.sale_price))}</strong></p>{purchase.user_cover_url && <img className="purchase-cover" src={purchase.user_cover_url} alt="Cover" />}<dl><dt>Variant</dt><dd>{purchase.variant_label || "Standard"}</dd><dt>Grade</dt><dd>{purchase.slab_company ? `${purchase.slab_company} ${purchase.grade_numeric ?? ""}` : purchase.condition || purchase.grade_numeric || "Not graded"}</dd><dt>Cert</dt><dd>{purchase.slab_cert_number || "None"}</dd></dl>{photos.length > 0 && <div className="purchase-photos">{photos.map((p) => <img key={p.storage_path} src={`${storageBase}${p.storage_path}`} alt={p.kind || "Seller photo"} />)}</div>}<p>Status: <strong>{purchase.status.replace("_", " ")}</strong></p>{purchase.status === "pending_buyer" && <div className="mark-sold-actions"><button className="primary" disabled={busy} onClick={() => act("confirm")}>Confirm receipt</button><button disabled={busy} onClick={() => act("dispute")}>Something's wrong</button></div>}{purchase.status === "confirmed" && <p><Link href="/library">View it in your collection</Link></p>}{error && <p className="mark-sold-error">{error}</p>}</main>;
}
