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

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (search.get("return") === "1") {
          const refresh = await authedFetch("/api/sell/stripe/refresh", { method: "POST" });
          if (!refresh.ok && refresh.status !== 404) throw new Error("We could not refresh your Stripe status.");
        }
        const response = await authedFetch("/api/sell/stripe/status");
        const body = await response.json().catch(() => ({}));
        if (response.status === 404) { if (active) setDenied(true); return; }
        if (!response.ok) throw new Error(body.error || "Could not load payout setup.");
        if (active) setSeller(body.seller);
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
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  </main>;
}
