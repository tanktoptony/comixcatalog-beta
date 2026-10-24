"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { authedFetch } from "@/lib/apiClient";
import { sellerStatusSummary } from "@/lib/sellerStanding";
import styles from "./payouts.module.css";

export default function PayoutsClient() {
  const search = useSearchParams();
  const [seller, setSeller] = useState(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [extraShipping, setExtraShipping] = useState("1.00");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (search.get("return") === "1") {
          const refresh = await authedFetch("/api/sell/stripe/refresh", { method: "POST" });
          // A failed refresh shouldn't hide setup: show a note and still load the saved status.
          if (!refresh.ok && refresh.status !== 404 && active) setError("We could not refresh your Stripe status just now. If you finished with Stripe, reload in a minute.");
        }
        const response = await authedFetch("/api/sell/stripe/status");
        const body = await response.json().catch(() => ({}));
        if (response.status === 404) { if (active) setDenied(true); return; }
        if (!response.ok) throw new Error(body.error || "Could not load payout setup.");
        if (active) { setSeller(body.seller); setExtraShipping(((body.seller?.additional_item_shipping_cents ?? 100) / 100).toFixed(2)); }
      } catch (loadError) { if (active) setError(loadError.message); }
    }
    load();
    return () => { active = false; };
  }, [search]);

  async function open(path) {
    setBusy(true); setError("");
    try {
      const response = await authedFetch(path, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) throw new Error(body.error || "Stripe is unavailable right now.");
      window.location.assign(body.url);
    } catch (openError) { setError(openError.message); setBusy(false); }
  }

  async function saveShipping(event) {
    event.preventDefault(); setBusy(true); setError("");
    const cents = Math.round(Number(extraShipping) * 100);
    try {
      const response = await authedFetch("/api/sell/stripe/status", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ additional_item_shipping_cents: cents }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSeller((current) => ({ ...current, ...body.seller }));
    } catch (saveError) { setError(saveError.message); } finally { setBusy(false); }
  }

  const summary = sellerStatusSummary(seller || null);
  if (denied) notFound();
  return <main className={styles.shell}>
    <Link href="/sell" className={styles.back}>Back to selling</Link>
    <section className={styles.card}>
      <span className={styles.eyebrow}>Seller payouts</span>
      <h1>{seller === undefined && !error ? "Loading payout setup" : summary.label}</h1>
      {seller === undefined && !error ? <p className={styles.muted}>Checking your Stripe account...</p> : <p>{summary.detail}</p>}
      {summary.state === "not_started" && seller !== undefined && <><p className={styles.muted}>Stripe securely collects identity and bank details. ComixCatalog never stores those details.</p><button disabled={busy} onClick={() => open("/api/sell/stripe/onboard")}>Set up payouts with Stripe</button></>}
      {summary.state === "pending" && <><p className={styles.muted}>{seller.requirements_due?.length ? `Still needed: ${seller.requirements_due.join(", ")}` : "Stripe will show you what is still needed."}</p><button disabled={busy} onClick={() => open("/api/sell/stripe/onboard")}>Continue setup</button></>}
      {summary.state === "ready" && <><span className={styles.badge}>{seller.tier === "established" ? "Established" : "New seller"}</span>{seller.tier === "new" && <ul><li>Up to 25 active priced listings</li><li>Up to $1,000 per listing</li><li>Up to $2,000 in open orders</li></ul>}<button disabled={busy} onClick={() => open("/api/sell/stripe/dashboard")}>Open Stripe dashboard</button></>}
      {seller && (
        <form onSubmit={saveShipping} className={styles.shipping}>
          <h2>Combined shipping</h2>
          <p className={styles.muted}>When someone buys several of your books at once, they pay your highest shipping price once, plus this for each extra book.</p>
          <label>
            Each extra book ships for
            <span className={styles.money}>$<input type="number" min="0" max="20" step="0.01" value={extraShipping} onChange={(event) => setExtraShipping(event.target.value)} /></span>
          </label>
          <button disabled={busy}>Save</button>
        </form>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  </main>;
}
