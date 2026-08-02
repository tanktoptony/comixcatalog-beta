"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";

const TIERS = [
  {
    id: "pro",
    name: "Collector Pro",
    price: "$8",
    period: "/ month",
    badge: "Recommended",
    via: "stripe",
    viaLabel: "via Stripe · cancel anytime",
    headline: "The full toolkit for serious collectors",
    description: "Everything you need to manage a real collection — professional grading, slab tracking, your own photos, and a PDF you can hand to your insurance agent.",
    features: [
      { label: "Insurance & appraisal PDF export — cover art, grades, cert numbers, value totals, date-stamped" },
      { label: "Professional grading — CGC/CBCS/PGX slab tracking, 0.5–10.0 numeric grades, cert numbers" },
      { label: "Upload your own photo for each book in your collection" },
      { label: "Run completion tracker — see your % owned on any series, add every missing issue to your wantlist in one click" },
      { label: "Story arc completion — \"You own 11 of 14 from X-Cutioner's Song\" with bulk-add-to-wantlist" },
      { label: "Wantlist CSV export — printable shopping list for cons and shops, sorted by title" },
      { label: "Library health audit — find books accidentally tracked twice (local entry + catalog entry for the same issue)" },
      { label: "Catalog linking — auto-match your manually-added books to our catalog so arc badges, run completion, and valuation light up retroactively" },
      { label: "CSV import up to 200 rows per upload (vs. 25 on free)" },
      { label: "Full-collection CSV export (Discogs-style)" },
      { label: "Collector Pro badge on your profile" },
      { label: "Want-list price alerts — get notified when a book drops to your target price", soon: true },
      { label: "Automatic market valuation from recent sold comps", soon: true },
      { label: "Early marketplace access — buy and sell when it launches (Pro subscribers first)", soon: true },
    ],
    cta: "Start Collector Pro — $8/month",
    tier: "pro",
  },
];

export default function UpgradePage() {
  const { user, isPro, isFounding, loading } = useAuth();
  const [busy, setBusy] = useState(null); // stores tier id while loading
  const [err, setErr] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [foundingRemaining, setFoundingRemaining] = useState(83);

  useEffect(() => {
    // Hydration guard: auth state is client-only and the initial server render
    // must not guess which membership actions to show.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    fetch("/api/founding/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Number.isFinite(data?.remaining)) setFoundingRemaining(data.remaining);
      })
      .catch(() => {});
  }, []);

  async function handleCheckout(tier) {
    if (!user) {
      window.location.assign(`/login?next=/upgrade`);
      return;
    }
    setBusy(tier);
    setErr(null);
    try {
      const res = await authedFetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setErr(data.error || "Could not start checkout");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleManageBilling() {
    if (!user) return;
    setBusy("manage");
    setErr(null);
    try {
      const res = await authedFetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
      setBusy(null);
    }
  }

  const alreadyPro = mounted && (isPro || isFounding);

  return (
    <main className="upgrade-shell">

      <section className="upgrade-hero">
        <div className="upgrade-kicker">Simple pricing</div>
        <h1 className="upgrade-title">
          Catalog like a pro. $8/mo.
        </h1>
        <p className="upgrade-sub">
          Track every grade, slab cert, and value across your whole collection.
          Generate an insurance-ready PDF in one click. Cancel anytime &mdash;
          no ads, no data sales, no VC money.
        </p>
        <p className="upgrade-founding-offer">
          <Link href="/founding-collectors"><strong>{foundingRemaining} free lifetime Pro passes remain.</strong> Catalog 10 comics to qualify →</Link>
        </p>
      </section>

      {alreadyPro && (
        <section className="upgrade-already">
          <p>
            {isFounding
              ? "You're a Founding Collector — thank you for being part of this from the start."
              : "You're on Collector Pro."}
            {" "}
            <Link href="/library">Back to your library →</Link>
          </p>
          <button
            type="button"
            className="upgrade-secondary"
            onClick={handleManageBilling}
            disabled={busy === "manage"}
          >
            {busy === "manage" ? "Opening…" : "Manage billing & cancel"}
          </button>
          {err && <div className="upgrade-error">{err}</div>}
        </section>
      )}

      <section className="upgrade-tiers">
        {TIERS.filter((tier) => tier.id === "pro").map((tier) => (
          <div
            key={tier.id}
            className={`upgrade-tier-card ${tier.badge ? "upgrade-tier-card--featured" : ""}`}
          >
            {tier.badge && (
              <div className="upgrade-tier-badge">{tier.badge}</div>
            )}

            <div className="upgrade-tier-header">
              <div className="upgrade-tier-name">{tier.name}</div>
              <div className="upgrade-tier-price">
                <span className="upgrade-price-amount">{tier.price}</span>
                <span className="upgrade-price-period">{tier.period}</span>
              </div>
              <div className="upgrade-tier-via">{tier.viaLabel}</div>
            </div>

            <p className="upgrade-tier-description">{tier.description}</p>

            <ul className="upgrade-tier-features">
              {tier.features.map((f, i) => {
                const label = typeof f === "string" ? f : f.label;
                const soon = typeof f === "object" && f.soon;
                return (
                  <li key={i} style={soon ? { opacity: 0.7 } : undefined}>
                    {label}
                    {soon && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          padding: "1px 6px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.25)",
                          opacity: 0.85,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Coming soon
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="upgrade-tier-action">
              {!mounted ? (
                <button type="button" className="upgrade-cta" disabled suppressHydrationWarning>
                  {tier.cta}
                </button>
              ) : alreadyPro ? (
                <button type="button" className="upgrade-cta" disabled>
                  {isFounding && tier.id === "founding" ? "Your current plan" : isPro && tier.id === "pro" ? "Your current plan" : "Already a member"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`upgrade-cta ${tier.id === "founding" ? "upgrade-cta--gold" : ""}`}
                  onClick={() => handleCheckout(tier.tier)}
                  disabled={busy === tier.tier || loading}
                >
                  {busy === tier.tier ? "Redirecting…" : user ? tier.cta : "Sign in to upgrade"}
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      {err && <div className="upgrade-error upgrade-error--global">{err}</div>}

      <section className="upgrade-faq">
        <div className="upgrade-faq-item">
          <h3>How does the Founding Collector offer work?</h3>
          <p>Create a free account, catalog 10 comics, then claim an available pass. Founding Collectors keep the standard Collector Pro feature set for the lifetime of their account and the ComixCatalog service, with no card required.</p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Can I cancel?</h3>
          <p>
            Yes — cancel anytime from the Stripe billing portal (button above if you&rsquo;re
            already subscribed). No cancellation fees. Your Pro features stay active until the
            end of your billing period. Free lifetime Founding passes do not require billing.
          </p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Why $8 for Pro?</h3>
          <p>
            ComixCatalog is built solo. $8 keeps the servers running and features shipping — no
            ads, no data sales, and no VC pressure to flip the product.
          </p>
        </div>
      </section>

    </main>
  );
}
