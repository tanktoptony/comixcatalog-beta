"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import FeaturedCarousel from "@/components/FeaturedCarousel";
import { coverThumb } from "@/lib/coverThumb";
import HomeDispatch from "@/components/HomeDispatch";
import { trackEvent } from "@/lib/analytics";

// "217,000+" / "2.5M+": rounded down so the strip never overstates.
function proofNumber(n, fallback) {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n >= 1e6) return `${(Math.floor(n / 1e5) / 10).toLocaleString("en-US")}M+`;
  return `${(Math.floor(n / 1000) * 1000).toLocaleString("en-US")}+`;
}

export default function HomeClient({ featured = null, stats = null, dispatch = null }) {
  const { user } = useAuth();
  const router = useRouter();
  const [heroQuery, setHeroQuery] = useState("");
  // Pending until the results page has actually rendered, so the button
  // stays visibly pressed instead of looking like nothing happened.
  const [isSearching, startSearch] = useTransition();
  // Hero art: real covers from this week's featured series.
  const wall = (featured ?? []).filter((s) => s?.cover_path).slice(0, 12);

  // Funnel: which landing CTA actually moves people. Search itself is
  // measured on /search (the `search` event), not here.
  const cta = (location) => () =>
    trackEvent("cta_click", { location, logged_in: Boolean(user) });

  function handleHeroSearch(e) {
    e.preventDefault();
    const q = heroQuery.trim();
    trackEvent("cta_click", { location: "hero_search", logged_in: Boolean(user) });
    startSearch(() => router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search"));
  }

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <p className="lp-eyebrow">Built by collectors, for collectors · Chicago</p>
          <h1 className="lp-h1">
            Your collection, and its value, in one place.
          </h1>
          <p className="lp-sub">
            Every issue, grade and variant you own, what it&rsquo;s worth
            from real sold comps, and a wantlist for the hunt.
          </p>

          {/* Hero search — the activation surface. Anonymous visitors can act
              before signing up; this is how Discogs/Letterboxd onboard. */}
          <form
            className={`lp-hero-search${isSearching ? " is-searching" : ""}`}
            onSubmit={handleHeroSearch}
            role="search"
            aria-busy={isSearching}
          >
            <input
              type="search"
              className="lp-hero-search-input"
              placeholder="Search any comic — Absolute Batman, Saga #1, Amazing Spider-Man 300…"
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
              readOnly={isSearching}
              aria-label="Search comic series and issues"
            />
            <button type="submit" className="lp-hero-search-btn" disabled={isSearching}>
              {isSearching ? (
                <>
                  <span className="lp-spinner" aria-hidden="true" />
                  Searching…
                </>
              ) : (
                "Search"
              )}
            </button>
          </form>

          <div className="lp-ctas">
            <Link
              href={user ? "/library" : "/signup"}
              className="lp-cta-primary"
              onClick={cta("hero_primary")}
            >
              {user ? "Go to your library" : "Start free"}
            </Link>
          </div>
        </div>
        <div className="lp-hero-img" aria-hidden="true">
          {wall.length >= 8 ? (
            <div className="lp-wall">
              {[0, 1, 2, 3].map((col) => (
                <div key={col} className={`lp-wall-col lp-wall-col-${col}`}>
                  {wall.filter((_, i) => i % 4 === col).map((s, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={s.id}
                      src={coverThumb(s.cover_path)}
                      alt=""
                      className="lp-wall-cover"
                      fetchPriority={i === 0 ? "high" : "auto"}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/img/hero/comic-collage.jpg" alt="" fetchPriority="high" />
          )}
          <div className="lp-hero-img-fade" />
        </div>
      </section>

      {/* ── PROOF STRIP ──────────────────────────────────────── */}
      <section className="lp-proof">
        <div className="lp-proof-item">
          <span className="lp-proof-num">{proofNumber(stats?.series, "217,000+")}</span>
          <span className="lp-proof-label">series in the database</span>
        </div>
        <div className="lp-proof-divider" />
        <div className="lp-proof-item">
          <span className="lp-proof-num">{proofNumber(stats?.issues, "2.5M+")}</span>
          <span className="lp-proof-label">issues indexed</span>
        </div>
        <div className="lp-proof-divider" />
        <div className="lp-proof-item">
          <span className="lp-proof-num">{proofNumber(stats?.covers, "170,000+")}</span>
          <span className="lp-proof-label">covers archived</span>
        </div>
      </section>

      {/* ── FEATURED SERIES ──────────────────────────────────── */}
      <FeaturedCarousel initialSeries={featured} />

      {/* ── DISPATCH: news feed + who we are ─────────────────── */}
      <HomeDispatch
        newCovers={dispatch?.newCovers}
        feed={dispatch?.feed ?? []}
        ctaHref={user ? "/library" : "/signup"}
        ctaLabel={user ? "Go to your library" : "Start your collection, free"}
        onCta={cta("dispatch_note")}
      />

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
            Grade, condition, variant type, and cert number on every listing —
            verified collectors, no guesswork. Launching soon, starting with
            Pro members.
          </p>
        </div>
      </section>

      {/* ── FOUNDING COLLECTOR ───────────────────────────────── */}
      <section className="lp-founding">
        <div className="lp-founding-inner">
          <p className="lp-founding-kicker">Limited · Lifetime passes are going fast</p>
          <h2 className="lp-founding-h2">Founding Collector</h2>
          <p className="lp-founding-body">
            Join while spots remain and receive Collector Pro for life—free,
            automatically, with no card required. You&rsquo;ll also receive a permanent Founding Collector badge.
          </p>
          <Link
            href="/founding-collectors"
            className="lp-founding-cta"
            onClick={cta("founding")}
          >
            See the founding offer →
          </Link>
        </div>
      </section>

    </>
  );
}
