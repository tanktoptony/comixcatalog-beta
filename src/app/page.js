"use client";

import Link from "next/link";

export default function HomePage() {
  return (
  <>
    {/* HERO SECTION */}
    <section className="landing-hero">
      <div className="landing-hero-inner">
        {/* LEFT — TEXT */}
        <div className="landing-left">
          <a
            href="https://www.patreon.com/comixcatalog"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-badge"
          >
            ✨ Join as a founding collector
          </a>

          <h1 className="landing-title">
            The Discogs for Comics.{" "}
            <span className="landing-title-accent">Finally.</span>
          </h1>

          <p className="landing-subtitle">
            Catalog every issue. Track every variant. Buy and sell with
            verified collectors.{" "}
            <span className="landing-subtitle-accent">ComixCatalog</span> is
            the marketplace built for people who actually care about
            condition, keys, and provenance — not just clicks.
          </p>

          <ul className="landing-bullets">
            <li>
              Full issue + variant database (User-powered first, then full
              catalog with publisher partnerships).
            </li>
            <li>
              Track your personal collection value like a real portfolio.
            </li>
            <li>
              Seller listings with real condition notes, not vague
              nonsense.
            </li>
          </ul>
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

    {/* COMMUNITY SECTION */}
    <section className="landing-community">
      <div className="community-links">
        <a
          href="https://discord.gg/3qMNAvPG"
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
    </section>
  </>
);

}
