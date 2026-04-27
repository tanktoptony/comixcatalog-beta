"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function UpgradePage() {
  const { user, isPro, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleCheckout() {
    if (!user) {
      window.location.href = "/login?next=/upgrade";
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setErr(data.error || "Could not start checkout");
        return;
      }
      window.location.href = data.url;
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleManageBilling() {
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setErr(data.error || "Could not open billing portal");
        return;
      }
      window.location.href = data.url;
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="upgrade-shell">
      <section className="upgrade-hero">
        <div className="upgrade-kicker">ComixCatalog Pro</div>
        <h1 className="upgrade-title">Turn your collection into an insurance-ready portfolio.</h1>
        <p className="upgrade-sub">
          Generate appraisal-style PDFs with cover art, grades, cert numbers, and market-value totals —
          the document your insurer actually wants.
        </p>

        <div className="upgrade-price">
          <span className="upgrade-price-amount">$8</span>
          <span className="upgrade-price-period">/ month</span>
        </div>

        {!mounted ? (
          // SSR + initial client render — match exactly so React doesn't fight hydration.
          // Auth state isn't trustworthy yet, so we render a neutral placeholder.
          <button type="button" className="upgrade-cta" disabled suppressHydrationWarning>
            Upgrade to Pro
          </button>
        ) : isPro ? (
          <div className="upgrade-already">
            <p>You&rsquo;re already on Pro. <Link href="/library">Back to your library →</Link></p>
            <button
              type="button"
              className="upgrade-secondary"
              onClick={handleManageBilling}
              disabled={busy}
            >
              {busy ? "Opening…" : "Manage billing & cancel"}
            </button>
            {err && <div className="upgrade-error">{err}</div>}
          </div>
        ) : (
          <>
            <button
              type="button"
              className="upgrade-cta"
              onClick={handleCheckout}
              disabled={busy || loading}
            >
              {busy
                ? "Redirecting…"
                : user
                  ? "Upgrade to Pro"
                  : "Sign in to upgrade"}
            </button>
            {err && <div className="upgrade-error">{err}</div>}
          </>
        )}
      </section>

      <section className="upgrade-features">
        <h2>What you get</h2>
        <ul>
          <li>
            <strong>Insurance &amp; appraisal PDF export</strong> — cover art, grades, slab cert
            numbers, purchase price, and market-value totals on a branded report.
          </li>
          <li>
            <strong>Grading &amp; condition UI</strong> — CGC/CBCS slab tracking, 0.5–10.0 numeric
            grades, raw condition grades, and per-book notes.
          </li>
          <li>
            <strong>Purchase-price &amp; market-value tracking</strong> — know what you paid and
            what it&rsquo;s worth, rolled up across the whole collection.
          </li>
          <li>
            <strong>Early access</strong> to portfolio tracking, want-list price alerts, and the
            members-only marketplace as they ship.
          </li>
        </ul>
      </section>

      <section className="upgrade-faq">
        <h2>Why $8?</h2>
        <p>
          ComixCatalog is built solo in Chicago. Pro keeps the servers running and the features
          shipping — no ads, no data sales, no VC pressure to flip the product. Cancel anytime
          from your Stripe portal.
        </p>
      </section>
    </main>
  );
}
