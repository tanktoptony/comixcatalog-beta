"use client";

import Link from "next/link";
import ActivityFeed from "@/components/ActivityFeed";

export default function HomePage() {
  return (
  <>
    {/* HERO SECTION */}
    <section className="landing-hero">
      <div className="landing-hero-inner">
        {/* LEFT — TEXT */}
        <div className="landing-left">

          <h1 className="landing-title">
            <b>ComixCatalog </b>
            - The Home for Serious Comic Collectors
          </h1>
          <p className="landing-subtitle">
            Catalog your collection. Track performance over time. Buy and sell with clarity around grade, variant, and condition — all in one place.
          </p>

          <div className="landing-features-compact">

            <div className="landing-feature-compact">
              <span className="feature-label">CATALOG</span>
              <p>Every issue. Every printing. Every variant.</p>
            </div>

            <div className="landing-feature-compact">
              <span className="feature-label">TRACK</span>
              <p>Portfolio-style value insights over time.</p>
            </div>

            <div className="landing-feature-compact">
              <span className="feature-label">MARKETPLACE</span>
              <p>Transparent listings. Verified collectors.</p>
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

    <ActivityFeed />
    <br />
    {/* COMMUNITY SECTION */}
    <section className="landing-community">
      <div className="community-links">
        <a
          href="https://discord.gg/aQruGVnD3y"
          target="_blank"
          rel="noopener noreferrer"
          className="community-link"
          aria-label="Join us on Discord"
        >
          <img src="/icons/discord.svg" alt="Discord" />
        </a>

        <a
          href="https://www.reddit.com/r/comixcatalog"
          target="_blank"
          rel="noopener noreferrer"
          className="community-link"
          aria-label="Visit our Reddit"
        >
          <img src="/icons/reddit.svg" alt="Reddit" />
        </a>

        <a
          href="https://www.instagram.com/comixcatalog"
          target="_blank"
          rel="noopener noreferrer"
          className="community-link"
          aria-label="Instagram"
        >
          <img src="/icons/instagram.svg" alt="Instagram" />
        </a>

        <a
          href="https://www.youtube.com/@comixcatalog"
          target="_blank"
          rel="noopener noreferrer"
          className="community-link"
          aria-label="YouTube"
        >
          <img src="/icons/youtube.svg" alt="YouTube" />
        </a>

        <a
          href="mailto:comixcatalog@gmail.com"
          className="community-link"
          aria-label="Email"
        >
          <img src="/icons/mail.svg" alt="Email" />
        </a>
      </div>

      <div className="support-section">
        <div className="support-divider" />
        <p className="support-text">
          ComixCatalog is being built independently. If you believe in a better platform for collectors and want to help accelerate development, consider supporting the project.
        </p>
        <a
          href="https://www.patreon.com/cw/ComixCatalog"
          target="_blank"
          rel="noopener noreferrer"
          className="support-button"
        >
          Support the Build
        </a>
      </div>


    </section>
  </>
);

}
