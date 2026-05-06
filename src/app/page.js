"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import FeaturedCarousel from "@/components/FeaturedCarousel";
import ActivityFeed from "@/components/ActivityFeed";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <p className="lp-eyebrow">Built by collectors, for collectors · Chicago</p>
          <h1 className="lp-h1">
            The database, collection manager, and marketplace for comic books.
          </h1>
          <p className="lp-sub">
            What Discogs is for music — but for comics. Search any issue, catalog
            what you own, track its value, and buy or sell with full grade transparency.
          </p>
          <div className="lp-ctas">
            <Link href={user ? "/library" : "/signup"} className="lp-cta-primary">
              {user ? "Go to your library" : "Start free"}
            </Link>
            <Link href="/upgrade" className="lp-cta-ghost">
              See Founding Collector →
            </Link>
          </div>
        </div>
        <div className="lp-hero-img">
          {/* Replace hero-comics.jpg with your own photo at public/img/hero-comics.jpg */}
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
          <span className="lp-proof-num">Millions</span>
          <span className="lp-proof-label">of issues indexed</span>
        </div>
        <div className="lp-proof-divider" />
        <div className="lp-proof-item">
          <span className="lp-proof-num">35,000+</span>
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
          <p className="lp-founding-kicker">Limited · First 100 only</p>
          <h2 className="lp-founding-h2">Founding Collector</h2>
          <p className="lp-founding-body">
            Lock in $20/mo forever — including the lowest marketplace fee rate (3% vs. 8%),
            priority listing placement, and a permanent badge that never goes away.
            This is how ComixCatalog gets built.
          </p>
          <Link href="/upgrade" className="lp-founding-cta">
            Claim a Founding Collector spot →
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
