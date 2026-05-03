"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const PATREON_URL = "https://www.patreon.com/cw/ComixCatalog";

const TIERS = [
  {
    id: "supporter",
    name: "Supporter",
    price: "$3",
    period: "/ month",
    badge: null,
    via: "patreon",
    viaLabel: "via Patreon",
    headline: "Back the build",
    description: "Help keep ComixCatalog alive and independent. No features unlocked — just direct support for a solo project.",
    features: [
      "Supporter badge on your profile",
      "Discord access & behind-the-scenes updates",
      "Satisfaction of supporting indie software",
    ],
    cta: "Support on Patreon",
    href: PATREON_URL,
  },
  {
    id: "pro",
    name: "Collector Pro",
    price: "$8",
    period: "/ month",
    badge: "Most popular",
    via: "stripe",
    viaLabel: "via Stripe · cancel anytime",
    headline: "The full toolkit for serious collectors",
    description: "Everything you need to manage a real collection — grades, slabs, values, and a PDF you can hand to your insurance agent.",
    features: [
      "Insurance & appraisal PDF export — cover art, grades, cert numbers, market-value totals, date-stamped",
      "Grading & condition UI — CGC/CBCS/PGX slab tracking, 0.5–10.0 numeric grades, raw condition labels",
      "Upload your own photo for each book in your collection",
      "Purchase price & market value tracking — see your collection's total value at a glance",
      "Want-list price alerts — get notified when a book drops to your target price",
      "Early marketplace access — buy and sell when it launches (Pro subscribers first)",
      "Collector Pro badge on your profile",
    ],
    cta: "Upgrade to Collector Pro",
    tier: "pro",
  },
  {
    id: "founding",
    name: "Founding Collector",
    price: "$20",
    period: "/ month",
    badge: "Limited — first 100",
    via: "stripe",
    viaLabel: "via Stripe · cancel anytime",
    headline: "Pro features + marketplace priority, forever",
    description: "Everything in Collector Pro, plus permanent recognition and the best deal on the marketplace — locked in as long as you stay subscribed.",
    features: [
      "Everything in Collector Pro",
      "Reduced marketplace fee — 3% instead of 8%, locked in permanently",
      "Priority listing placement — your books appear above standard Pro listings",
      "Verified Collector badge included — links your CGC/CBCS grades to your profile ($10 value)",
      "Permanent Founding Collector badge — stays on your profile even if you downgrade",
      "Your name on the ComixCatalog founders page",
      "Locked-in $20/mo pricing — your rate never increases, ever",
      "Direct roadmap access — feature voting and early previews",
      "Patreon Collector Beta access included",
    ],
    cta: "Claim a Founding Collector Spot",
    tier: "founding",
  },
];

export default function UpgradePage() {
  const { user, isPro, isFounding, loading } = useAuth();
  const [busy, setBusy] = useState(null); // stores tier id while loading
  const [err, setErr] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  async function handleCheckout(tier) {
    if (!user) {
      window.location.href = `/login?next=/upgrade`;
      return;
    }
    setBusy(tier);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, tier }),
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
      setBusy(null);
    }
  }

  async function handleManageBilling() {
    if (!user) return;
    setBusy("manage");
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
      setBusy(null);
    }
  }

  const alreadyPro = mounted && (isPro || isFounding);

  return (
    <main className="upgrade-shell">

      <section className="upgrade-hero">
        <div className="upgrade-kicker">Membership</div>
        <h1 className="upgrade-title">
          Choose how you support ComixCatalog.
        </h1>
        <p className="upgrade-sub">
          Built solo in Chicago — no ads, no VC money. Collector Pro unlocks the full toolset.
          Founding Collector locks in your rate forever and gets you the best deal on the marketplace when it launches.
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
                <span className="upgrade-price-amount">{tier.price}</span>
                <span className="upgrade-price-period">{tier.period}</span>
              </div>
              <div className="upgrade-tier-via">{tier.viaLabel}</div>
            </div>

            <p className="upgrade-tier-description">{tier.description}</p>

            <ul className="upgrade-tier-features">
              {tier.features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>

            <div className="upgrade-tier-action">
              {!mounted ? (
                <button type="button" className="upgrade-cta" disabled suppressHydrationWarning>
                  {tier.cta}
                </button>
              ) : tier.via === "patreon" ? (
                <a
                  href={tier.href}
                  className="upgrade-cta upgrade-cta--secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tier.cta}
                </a>
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
          <h3>What&rsquo;s the difference between Patreon and Stripe?</h3>
          <p>
            Patreon is for community support — the Supporter tier gives you a badge and Discord
            access but doesn&rsquo;t unlock site features. Collector Pro and Founding Collector are
            billed through Stripe and unlock the actual tools: PDF export, grading, photo upload,
            and everything coming in Phase 2.
          </p>
        </div>
        <div className="upgrade-faq-item">
          <h3>I&rsquo;m already a Patreon Collector Beta subscriber. Do I get Pro?</h3>
          <p>
            Not automatically — Patreon and the site are separate systems right now.
            Upgrade here to unlock site features. If you&rsquo;re a longtime Collector Beta
            patron, reach out at{" "}
            <a href="mailto:comixcatalog@gmail.com">comixcatalog@gmail.com</a>{" "}
            and we&rsquo;ll sort you out.
          </p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Can I cancel?</h3>
          <p>
            Yes — cancel anytime from the Stripe billing portal (button above if you&rsquo;re
            already subscribed). No cancellation fees. Your Pro features stay active until the
            end of your billing period. Founding Collector pricing is locked in permanently
            as long as you stay subscribed.
          </p>
        </div>
        <div className="upgrade-faq-item">
          <h3>Why $8 for Pro?</h3>
          <p>
            ComixCatalog is built solo. $8 keeps the servers running and features shipping — no
            ads, no data sales, no VC pressure to flip the product. It matches the Patreon
            Collector Beta tier intentionally.
          </p>
        </div>
      </section>

    </main>
  );
}
