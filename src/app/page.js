"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import FeaturedCarousel from "@/components/FeaturedCarousel";
import ActivityFeed from "@/components/ActivityFeed";
import OnboardingModal from "@/components/OnboardingModal";

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [heroQuery, setHeroQuery] = useState("");

  function handleHeroSearch(e) {
    e.preventDefault();
    const q = heroQuery.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <>
      {/* First-visit onboarding modal — self-gates via localStorage so it
          only fires once. Component returns null when seen or signed out. */}
      <OnboardingModal />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <p className="lp-eyebrow">Built by collectors, for collectors · Chicago</p>
          <h1 className="lp-h1">
            Your collection, and its value, in one place.
          </h1>
          <p className="lp-sub">
            Track every issue, grade, and variant you own &mdash; plus what
            you&rsquo;re hunting. Live values from real sold comps. The database,
            collection manager, and marketplace for comic books.
          </p>

          {/* Hero search — the activation surface. Anonymous visitors can act
              before signing up; this is how Discogs/Letterboxd onboard. */}
          <form className="lp-hero-search" onSubmit={handleHeroSearch} role="search">
            <input
              type="search"
              className="lp-hero-search-input"
              placeholder="Search any comic — Absolute Batman, Saga #1, Amazing Spider-Man 300…"
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
              aria-label="Search comic series and issues"
            />
            <button type="submit" className="lp-hero-search-btn">
              Search
            </button>
          </form>

          <div className="lp-ctas">
            <Link href={user ? "/library" : "/signup"} className="lp-cta-primary">
              {user ? "Go to your library" : "Start free"}
            </Link>
            <Link href="/search" className="lp-cta-ghost">
              Browse the database →
            </Link>
          </div>
        </div>
        <div className="lp-hero-img">
          <img src="/img/hero/comic-collage.jpg" alt="Comic book collection" />
          <div className="lp-hero-img-fade" />
        </div>
      </section>

      {/* ── PROOF STRIP ──────────────────────────────────────── */}
      <section className="lp-proof">
        <div className="lp-proof-item">
          <span className="lp-proof-num">217,000+</span>
          <span className="lp-proof-label">series in the database</span>
        </div>
        <div className="lp-proof-divider" />
        <div className="lp-proof-item">
          <span className="lp-proof-num">2.5M+</span>
          <span className="lp-proof-label">issues indexed</span>
        </div>
        <div className="lp-proof-divider" />
        <div className="lp-proof-item">
          <span className="lp-proof-num">90,000+</span>
          <span className="lp-proof-label">cover scans archived</span>
        </div>
      </section>

      {/* ── PROBLEM ──────────────────────────────────────────── */}
      <section className="lp-problem">
        <h2 className="lp-problem-h2">One tool, every detail.</h2>
        <p className="lp-problem-body">
          Track grades, variants, newsstand vs. direct, CGC and CBCS cert numbers,
          purchase prices, and current market values across hundreds or thousands
          of books. Export an insurance-ready PDF in a click. Sell when you&rsquo;re
          ready, with verified grades on every listing.
        </p>
      </section>

      {/* ── FEATURED SERIES ──────────────────────────────────── */}
      <FeaturedCarousel />

      {/* ── FEATURE TRIPTYCH ─────────────────────────────────── */}
      <section className="lp-features">
        <div className="lp-feature">
          <div className="lp-feature-icon">◈</div>
          <h3>Catalog</h3>
          <p>
            Every series, issue, printing, and variant — indexed from the
            Grand Comics Database with ComicVine cover art on top.
          </p>
        </div>
        <div className="lp-feature">
          <div className="lp-feature-icon">◈</div>
          <h3>Collect</h3>
          <p>
            Track grades, slab cert numbers, purchase prices, and current values.
            Generate an insurance-ready PDF with one click — cover art, grades,
            and market-value totals included.
          </p>
        </div>
        <div className="lp-feature">
          <div className="lp-feature-icon">◈</div>
          <h3>Marketplace</h3>
          <p>
            Buy and sell with full transparency — grade, condition, variant type,
            and cert number on every listing. Verified collectors, no guesswork.
          </p>
        </div>
      </section>

      {/* ── FOUNDING COLLECTOR ───────────────────────────────── */}
      <section className="lp-founding">
        <div className="lp-founding-inner">
          <p className="lp-founding-kicker">Limited · Lifetime passes are going fast</p>
          <h2 className="lp-founding-h2">Founding Collector</h2>
          <p className="lp-founding-body">
            Catalog 10 comics and claim Collector Pro for life—free, with no
            card required. You&rsquo;ll also receive a permanent Founding Collector badge.
          </p>
          <Link href="/founding-collectors" className="lp-founding-cta">
            Claim lifetime Pro →
          </Link>
        </div>
      </section>

      {/* ── RECENT ACTIVITY ──────────────────────────────────── */}
      <ActivityFeed />

      {/* ── BOTTOM CTA ───────────────────────────────────────── */}
      <section className="lp-bottom-cta">
        <h2>Start building your collection.</h2>
        <p>Free to join. No credit card required.</p>
        <Link href={user ? "/library" : "/signup"} className="lp-cta-primary">
          {user ? "Go to your library" : "Create a free account"}
        </Link>
      </section>
    </>
  );
}
