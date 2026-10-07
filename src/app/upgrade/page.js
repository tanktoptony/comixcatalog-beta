"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";

const TIERS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    via: "none",
    viaLabel: "no card, no trial clock",
    headline: "A real catalog and a real collection tracker, for nothing",
    description: "The part most sites charge for is free here. Track what you own, find what you are missing, and read the guides. Pro adds the tools a serious collection needs, not the basics.",
    // Every line here must be true of the shipped product today. If a
    // feature isn't live, it doesn't go on this page, "soon" or otherwise.
    features: [
      { label: "2.5 million issues across 200,000+ series, from the Grand Comics Database" },
      { label: "Covers matched to the right issue. If we don't have the right cover, the spot stays blank instead of showing a wrong one" },
      { label: "Track what you own and what you are hunting, with no cap on collection size and room for more than one copy of a book" },
      { label: "Search by title, year or issue, typos and all. \"rai 1994\" finds the volume you mean" },
      { label: "Scan a cover with your phone to find the issue, 10 scans a day" },
      { label: "Estimated values from current eBay asking prices, labeled as asking. We don't have sold-price data yet, so we don't claim it" },
      { label: "Run completion: see how much of a series you own and exactly which issues you're missing" },
      { label: "Pick which variant cover is the one on your shelf" },
      { label: "Key issue flags on the big first appearances and deaths, with a line on why they matter. The list is short and growing" },
      { label: "List books from your collection for sale (beta). No fees. Buyers message you with offers; there's no checkout yet" },
      { label: "Reading guides and articles, written by a collector rather than generated" },
      { label: "A public profile you can share, if you want one" },
      { label: "CSV import up to 25 rows per upload" },
    ],
    cta: "Create a free account",
    tier: "free",
  },
  {
    id: "pro",
    name: "Collector Pro",
    price: "$8",
    period: "/ month",
    badge: "Recommended",
    via: "stripe",
    viaLabel: "via Stripe · cancel anytime",
    headline: "The full toolkit for serious collectors",
    description: "Everything you need to manage a real collection: professional grading, slab tracking, your own photos, and a PDF you can hand to your insurance agent.",
    features: [
      { label: "Professional grading: CGC, CBCS and PGX slabs, 0.5 to 10.0 numeric grades, cert numbers" },
      { label: "Upload your own photo for each copy in your collection" },
      { label: "Insurance and appraisal PDF: cover art, grades, cert numbers, value totals with their source, date-stamped" },
      { label: "Collection value over time, charted from the same asking-price estimates" },
      { label: "Add every missing issue of a run to your wantlist in one click" },
      { label: "Story arc completion: \"You own 11 of 14 from X-Cutioner's Song,\" with one-click add of the rest" },
      { label: "Full-collection CSV export" },
      { label: "Wantlist CSV export: a printable shopping list for cons and shops, sorted by title" },
      { label: "Library health audit: find books accidentally tracked twice" },
      { label: "Catalog linking: match books you added by hand to the catalog, so run completion, arcs and values pick them up" },
      { label: "CSV import up to 200 rows per upload (25 on Free)" },
      { label: "Cover scanning up to 100 a day (10 on Free)" },
      { label: "Collector Pro badge on your profile" },
    ],
    cta: "Start Collector Pro, $8/month",
    tier: "pro",
  },
];

export default function UpgradePage() {
  const { user, isPro, isFounding, loading } = useAuth();
  const [busy, setBusy] = useState(null); // stores tier id while loading
  const [err, setErr] = useState(null);
  const [mounted, setMounted] = useState(false);
  // null until /api/founding/status answers. A hardcoded guess here used to
  // flash a wrong count on every page load.
  const [foundingRemaining, setFoundingRemaining] = useState(null);
  const foundingOpen = foundingRemaining == null || foundingRemaining > 0;

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
      setErr("Network error. Please try again.");
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
      setErr("Network error. Please try again.");
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
          {foundingOpen ? "Join now. Keep Pro for life." : "Free to collect. Pro when you need it."}
        </h1>
        <p className="upgrade-sub">
          The first 100 members receive Collector Pro for life at no charge.
          After the founding memberships are gone, Collector Pro is $8/month.
        </p>
        {foundingOpen && (
          <p className="upgrade-founding-offer">
            <Link href="/signup">
              <strong>
                {foundingRemaining == null
                  ? "Free lifetime Pro memberships are still available."
                  : `${foundingRemaining} free lifetime Pro memberships remain.`}
              </strong>{" "}
              Create your account and receive yours automatically →
            </Link>
          </p>
        )}
      </section>

      {alreadyPro && (
        <section className="upgrade-already">
          <p>
            {isFounding
              ? "You're a Founding Collector. Thank you for being part of this from the start."
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
        {TIERS.filter((tier) => tier.id === "free" || tier.id === "pro").map((tier) => (
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
              {tier.id === "free" ? (
                // Not the Stripe path: nothing to buy, and an existing
                // account should not be told to make another.
                user ? (
                  <Link href="/library" className="upgrade-cta">Go to your library</Link>
                ) : (
                  <Link href="/signup" className="upgrade-cta">{tier.cta}</Link>
                )
              ) : !mounted ? (
                <button type="button" className="upgrade-cta" disabled suppressHydrationWarning>
                  {tier.cta}
                </button>
              ) : alreadyPro ? (
                <button type="button" className="upgrade-cta" disabled>
                  {isFounding && tier.id === "founding" ? "Your current plan" : isPro && tier.id === "pro" ? "Your current plan" : "Already a member"}
                </button>
              ) : foundingOpen ? (
                <Link href={user ? "/founding-collectors" : "/signup"} className="upgrade-cta">
                  Get Pro free for life
                </Link>
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
          <p>Create an account while a spot remains. Lifetime Collector Pro and the Founding Collector badge are added automatically, with no card required.</p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Can I cancel?</h3>
          <p>
            Yes. Cancel anytime from the Stripe billing portal (button above if you&rsquo;re
            already subscribed). No cancellation fees. Your Pro features stay active until the
            end of your billing period. Free lifetime Founding passes do not require billing.
          </p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Why $8 for Pro?</h3>
          <p>
            ComixCatalog is built solo. $8 keeps the servers running and features shipping, with
            no third-party ads, no data sales, and no VC pressure to flip the product.
          </p>
        </div>
      </section>

    </main>
  );
}
