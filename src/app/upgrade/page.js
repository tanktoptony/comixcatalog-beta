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
    description: "The whole collector toolkit is free. Track, grade, value, organize, import, and export your collection without a subscription.",
    // Every line here must be true of the shipped product today. If a
    // feature isn't live, it doesn't go on this page, "soon" or otherwise.
    features: [
      { label: "2.5 million issues across 200,000+ series, from the Grand Comics Database" },
      { label: "Covers matched to the right issue. If we don't have the right cover, the spot stays blank instead of showing a wrong one" },
      { label: "Track what you own and what you are hunting, with no cap on collection size and room for more than one copy of a book" },
      { label: "Search by title, year or issue, typos and all. \"rai 1994\" finds the volume you mean" },
      { label: "Scan a cover with your phone to find the issue, 100 scans a day" },
      { label: "Estimated values from current eBay asking prices, labeled as asking. We don't have sold-price data yet, so we don't claim it" },
      { label: "Run completion: see how much of a series you own and exactly which issues you're missing" },
      { label: "Pick which variant cover is the one on your shelf" },
      { label: "Key issue flags on the big first appearances and deaths, with a line on why they matter. The list is short and growing" },
      { label: "List books from your collection for sale (beta). No fees. Buyers message you with offers; there's no checkout yet" },
      { label: "Reading guides and articles, written by a collector rather than generated" },
      { label: "A public profile you can share, if you want one" },
      { label: "Professional grading: CGC, CBCS and PGX slabs, 0.5 to 10.0 numeric grades, cert numbers" },
      { label: "Upload your own photo for each copy in your collection" },
      { label: "Insurance and appraisal PDF with cover art, grades, cert numbers, value totals, sources, and date" },
      { label: "Collection value over time, charted from the same asking-price estimates" },
      { label: "Add every missing issue of a run or story arc to your wantlist in one click" },
      { label: "Full collection and wantlist CSV exports" },
      { label: "Library health audit to find books accidentally tracked twice" },
      { label: "Catalog linking for books added by hand" },
      { label: "CSV import up to 200 rows per upload" },
    ],
    cta: "Create a free account",
    tier: "free",
  },
  {
    id: "plus",
    name: "Collector+",
    price: "$4",
    period: "/ month",
    badge: "Recommended",
    via: "stripe",
    viaLabel: "via Stripe · cancel anytime",
    headline: "Support an independent collector site",
    description: "Everything collectors need is free. Collector+ is how you support an independent site built and run by one person.",
    features: [
      { label: "Collector+ badge on your profile" },
      { label: "No upgrade prompts in house promos" },
    ],
    cta: "Join Collector+",
    tier: "plus",
  },
];

export default function UpgradePage() {
  const { user, isPro, isFounding, isPlus, loading } = useAuth();
  const [busy, setBusy] = useState(null); // stores tier id while loading
  const [err, setErr] = useState(null);
  const [mounted, setMounted] = useState(false);
  // null until /api/founding/status answers. A hardcoded guess here used to
  // flash a wrong count on every page load.
  const [foundingRemaining, setFoundingRemaining] = useState(null);
  const [interval, setInterval] = useState("month");
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
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
    if (user) {
      authedFetch("/api/stripe/portal", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => setHasStripeCustomer(Boolean(data?.hasCustomer)))
        .catch(() => {});
    }
  }, [user]);

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
        body: JSON.stringify({ tier, interval }),
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

  const alreadyMember = mounted && (isPro || isFounding || isPlus);

  return (
    <main className="upgrade-shell">

      <section className="upgrade-hero">
        <div className="upgrade-kicker">Simple pricing</div>
        <h1 className="upgrade-title">
          {foundingOpen ? "Join now. Free membership for life." : "Free to collect. Collector+ to support it."}
        </h1>
        <p className="upgrade-sub">
          The first 100 members get a free membership for life. After that,
          supporting the site is Collector+, $4 a month or $36 a year.
        </p>
        {foundingOpen && (
          <p className="upgrade-founding-offer">
            <Link href="/signup">
              <strong>Free lifetime memberships are still available.</strong>{" "}
              Create your account and claim yours →
            </Link>
          </p>
        )}
      </section>

      {alreadyMember && (
        <section className="upgrade-already">
          <p>
            {isFounding
              ? "You're a Founding Collector. Thank you for being part of this from the start."
              : isPlus
                ? "You're on Collector+."
                : "You're on Collector Pro."}
            {" "}
            <Link href="/library">Back to your library →</Link>
          </p>
          {hasStripeCustomer && <button
            type="button"
            className="upgrade-secondary"
            onClick={handleManageBilling}
            disabled={busy === "manage"}
          >
            {busy === "manage" ? "Opening…" : "Manage billing & cancel"}
          </button>}
          {err && <div className="upgrade-error">{err}</div>}
        </section>
      )}

      <section className="upgrade-tiers">
        {TIERS.map((tier) => (
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
                <span className="upgrade-price-amount">{tier.id === "plus" && interval === "year" ? "$3" : tier.price}</span>
                <span className="upgrade-price-period">{tier.period}</span>
              </div>
              {tier.id === "plus" && (
                <div className="upgrade-interval-toggle" role="group" aria-label="Billing interval">
                  <button type="button" className={interval === "month" ? "is-active" : ""} onClick={() => setInterval("month")}>Monthly</button>
                  <button type="button" className={interval === "year" ? "is-active" : ""} onClick={() => setInterval("year")}>Yearly</button>
                </div>
              )}
              {tier.id === "plus" && interval === "year" && (
                <div className="upgrade-tier-via">billed yearly at $36, save 25%</div>
              )}
              <div className="upgrade-tier-via">{tier.viaLabel}</div>
            </div>

            <p className="upgrade-tier-description">{tier.description}</p>

            <ul className="upgrade-tier-features">
              {tier.features.map((f, i) => {
                const label = typeof f === "string" ? f : f.label;
                return (
                  <li key={i}>
                    {label}
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
              ) : alreadyMember ? (
                <button type="button" className="upgrade-cta" disabled>
                  {tier.id === "plus" && isPlus ? "Your current plan" : "Already a member"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`upgrade-cta ${tier.id === "founding" ? "upgrade-cta--gold" : ""}`}
                  onClick={() => handleCheckout(tier.tier)}
                  disabled={busy === tier.tier || loading}
                >
                  {busy === tier.tier ? "Redirecting…" : tier.cta}
                </button>
              )}
              {/* Shown under the button: at the bottom of the page a failed
                  checkout looked like the click did nothing. */}
              {tier.id !== "free" && err && <div className="upgrade-error" role="alert">{err}</div>}
            </div>
          </div>
        ))}
      </section>


      <section className="upgrade-faq">
        <div className="upgrade-faq-item">
          <h3>How does the Founding Collector offer work?</h3>
          <p>Create an account while a spot remains, then click the link we email you. Confirming adds your lifetime membership and the Founding Collector badge, with no card required.</p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Can I cancel?</h3>
          <p>
            Yes. Cancel anytime from the Stripe billing portal (button above if you&rsquo;re
            already subscribed). No cancellation fees. Your Collector+ membership stays active until the
            end of your billing period. Free lifetime Founding passes do not require billing.
          </p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Why pay at all?</h3>
          <p>
            ComixCatalog is built solo, without third-party ads or selling your data. Collector+
            keeps the servers running and helps an independent site keep improving.
          </p>
        </div>
      </section>

    </main>
  );
}
