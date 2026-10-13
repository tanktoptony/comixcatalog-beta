/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @next/next/no-img-element */
"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import styles from "./purchase.module.css";

const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-photos/`;
const photoUrl = (photo) => photo?.url || (photo?.storage_path ? `${storageBase}${photo.storage_path}` : "");

function Skeleton() {
  return <main className={`${styles.page} ${styles.loading}`} aria-busy="true" aria-label="Loading purchase"><div className={styles.skeletonCover} /><div className={styles.skeletonBody}><i /><i /><i /><i /></div></main>;
}

export default function PurchasePage({ params }) {
  const { id } = use(params);
  const viewerRef = useRef(null);
  const [purchase, setPurchase] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [activePhoto, setActivePhoto] = useState(null);

  useEffect(() => { authedFetch(`/api/purchases/${id}`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setPurchase(body); }).catch((loadError) => setError(loadError.message)); }, [id]);

  async function act(action) {
    setBusy(true); setError("");
    try { const response = await authedFetch(`/api/purchases/${id}/${action}`, { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setPurchase((current) => ({ ...current, status: action === "confirm" ? "confirmed" : "disputed" })); setShowDispute(false); trackEvent(action === "confirm" ? "sale_transfer_confirmed" : "sale_transfer_disputed"); }
    catch (actionError) { setError(actionError.message); } finally { setBusy(false); }
  }
  function openPhoto(url) { setActivePhoto(url); viewerRef.current?.showModal(); }

  if (error && !purchase) return <main className={styles.messagePage}><section className={styles.messageCard}><span>Purchase unavailable</span><h1>We couldn't open this sale</h1><p>{error === "Purchase not found." ? "This purchase does not exist, or it belongs to another collector." : error}</p><Link href="/inbox">Back to inbox</Link></section></main>;
  if (!purchase) return <Skeleton />;

  const photos = Array.isArray(purchase.seller_photo_keys) ? purchase.seller_photo_keys : [];
  const title = `${purchase.series_title}${purchase.issue_number ? ` #${purchase.issue_number}` : ""}`;
  const hero = photoUrl(photos[0]) || purchase.user_cover_url;
  const seller = purchase.seller || { username: "unknown" };
  const grade = purchase.slab_company ? `${purchase.slab_company}${purchase.grade_numeric != null ? ` ${Number(purchase.grade_numeric).toFixed(1)}` : ""}` : purchase.condition || (purchase.grade_numeric != null ? Number(purchase.grade_numeric).toFixed(1) : "Not graded");
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: purchase.currency || "USD" }).format(Number(purchase.sale_price));
  const soldOn = new Date(purchase.sold_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.coverWrap}>{hero ? <button type="button" onClick={() => openPhoto(hero)} aria-label="Enlarge cover"><img src={hero} alt={`Seller's copy of ${title}`} /></button> : <div className={styles.coverMissing}>Cover unavailable</div>}</div>
      <div className={styles.details}><p className={styles.eyebrow}>Confirm your purchase</p><h1>{title}</h1><p className={styles.edition}>{[purchase.issue_number ? `#${purchase.issue_number}` : null, purchase.variant_label || "Standard edition"].filter(Boolean).join(" · ")}</p><div className={styles.pills}><span>{grade}</span>{purchase.slab_cert_number && <span>Cert {purchase.slab_cert_number}</span>}</div><strong className={styles.price}>{price}</strong><Link className={styles.seller} href={`/u/${encodeURIComponent(seller.username)}`}><Avatar profile={seller} width={42} height={42} /><span>Sold to you by <b>@{seller.username}</b><small>{soldOn}</small></span></Link></div>
    </section>
    {photos.length > 0 && <section className={styles.photos} aria-labelledby="seller-photos"><h2 id="seller-photos">Seller's photos</h2><div>{photos.map((photo, index) => { const url = photoUrl(photo); return <button type="button" key={photo.storage_path || url || index} onClick={() => openPhoto(url)}><img src={url} alt={photo.kind || `Seller photo ${index + 1}`} /></button>; })}</div></section>}
    <section className={styles.explainer}><span aria-hidden="true">✓</span><p><strong>Add this exact copy to your collection</strong>Confirming adds this exact copy to your collection with its grade and photos. Only confirm once it's in your hands.</p></section>
    <section className={`${styles.state} ${styles[purchase.status] || ""}`}>
      {purchase.status === "pending_buyer" && <><div className={styles.prompt}><p>Ready to confirm?</p><small>The seller will see your response.</small></div>{showDispute && <div className={styles.disputeConfirm}><p><strong>Report a problem with this purchase?</strong></p><p>This marks the transfer as disputed so you and the seller can resolve it.</p><div><button type="button" onClick={() => setShowDispute(false)} disabled={busy}>Go back</button><button type="button" onClick={() => act("dispute")} disabled={busy}>Yes, something's wrong</button></div></div>}<div className={styles.actions}><button className={styles.primary} disabled={busy || showDispute} onClick={() => act("confirm")}>{busy ? "Saving..." : "Confirm, it's in my hands"}</button><button className={styles.secondary} disabled={busy || showDispute} onClick={() => setShowDispute(true)}>Something's wrong</button></div></>}
      {purchase.status === "confirmed" && <Result icon="✓" title="It's in your collection" body="This copy and its details have been added to your library." href="/library" link="View it in your library" />}
      {purchase.status === "disputed" && <Result icon="!" title="Purchase marked as disputed" body="This transfer was not added to your collection." href={`/inbox/${encodeURIComponent(seller.username)}`} link={`Message @${seller.username}`} />}
      {purchase.status === "expired" && <Result icon="×" title="This request expired" body="This purchase can no longer be confirmed." href="/inbox" link="Back to inbox" />}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
    <dialog ref={viewerRef} className={styles.viewer} onClick={(event) => event.target === viewerRef.current && viewerRef.current.close()}><button type="button" aria-label="Close photo viewer" onClick={() => viewerRef.current?.close()}>×</button>{activePhoto && <img src={activePhoto} alt="Seller's copy enlarged" />}</dialog>
  </main>;
}

function Result({ icon, title, body, href, link }) { return <div className={styles.finished}><span aria-hidden="true">{icon}</span><div><h2>{title}</h2><p>{body}</p><Link href={href}>{link}</Link></div></div>; }
