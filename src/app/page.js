"use client";

import Link from "next/link";
import ActivityFeed from "@/components/ActivityFeed";
import FeaturedCarousel from "@/components/FeaturedCarousel";

export default function HomePage() {
  return (
  <>
    {/* HERO SECTION */}
    <section className="landing-hero">
      <div className="landing-hero-inner">
        {/* LEFT — TEXT */}
        <div className="landing-left">

          <p className="landing-eyebrow">Catalog · Collect · Connect</p>
          <h1 className="landing-title">
            A home for serious comic collectors.
          </h1>
          <p className="landing-subtitle">
            Catalog what you own. Track its value over time. Buy and sell
            with clarity on grade, variant, and condition.
          </p>

          <div className="landing-features-compact">

            <div className="landing-feature-compact">
              <span className="feature-label">Catalog</span>
              <p>Every issue. Every printing. Every variant.</p>
            </div>

            <div className="landing-feature-compact">
              <span className="feature-label">Track</span>
              <p>Portfolio insights, every book accounted for.</p>
            </div>

            <div className="landing-feature-compact">
              <span className="feature-label">Marketplace</span>
              <p>Transparent listings, verified collectors.</p>
            </div>
          </div>

        </div>

        {/* RIGHT — COVERS */}
        <div className="landing-right">
          <div className="landing-comic">
            <img src="/covers/uxm-266.jpg" alt="X-Men #266" />
            <div className="landing-comic-title">X-Men #266</div>
            <div className="landing-comic-sub">First Gambit</div>
          </div>

          <div className="landing-comic">
            <img src="/covers/asm-1.jpg" alt="ASM #1" />
            <div className="landing-comic-title">
              Amazing Spider-Man #1
            </div>
            <div className="landing-comic-sub">Silver Age debut</div>
          </div>

          <div className="landing-comic">
            <img src="/covers/avengers-1.jpg" alt="Avengers #1" />
            <div className="landing-comic-title">Avengers #1</div>
            <div className="landing-comic-sub">Assemble Begins</div>
          </div>
        </div>
      </div>
    </section>

    <FeaturedCarousel />
    <ActivityFeed />
    {/* Support / community CTAs moved to the global PatreonBanner + Footer. */}
  </>
);

}
