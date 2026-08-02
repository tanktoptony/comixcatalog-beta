import Link from "next/link";

export const metadata = {
  title: "Marketplace — In Development",
  description: "A collector-first comic marketplace in development, built around catalog-linked listings and transparent condition data.",
};

export default function MarketplacePage() {
  return (
    <section className="marketplace-page">
      <div className="mkt-hero">
        <div className="mkt-status-pill">In development</div>
        <h1 className="mkt-title">A marketplace built around grade, not guesswork.</h1>
        <p className="mkt-lede">
          We&rsquo;re building catalog-linked listings with clear issue, variant,
          condition, grade, and certification details. Seller pricing and fees
          will be published before transactions open—there is no marketplace fee today.
        </p>
        <div className="mkt-hero-ctas">
          <Link href="/founding-collectors" className="mkt-cta-primary">Join early testing →</Link>
          <Link href="/signup" className="mkt-cta-ghost">Create a free account</Link>
        </div>
        <div className="mkt-hero-fineprint">Founding Collectors will be invited to the first controlled marketplace tests.</div>
      </div>

      <h2 className="mkt-section-title">What we&rsquo;re building</h2>
      <div className="mkt-pillars">
        <div className="mkt-pillar"><div className="mkt-pillar-num">01</div><h3>Catalog-linked listings</h3><p>List directly from a tracked collection entry so buyers know the exact series, issue, and variant.</p></div>
        <div className="mkt-pillar"><div className="mkt-pillar-num">02</div><h3>Transparent condition</h3><p>Raw condition, slab company, numeric grade, and certification details live beside every listing.</p></div>
        <div className="mkt-pillar"><div className="mkt-pillar-num">03</div><h3>Collector-friendly economics</h3><p>We&rsquo;re evaluating a simple fee structure that can support the marketplace without burying sellers in surprises.</p></div>
        <div className="mkt-pillar"><div className="mkt-pillar-num">04</div><h3>Built for comics</h3><p>Search by issue, variant, grade, year, publisher, and run-completion gap—not generic collectible categories.</p></div>
      </div>

      <h2 className="mkt-section-title">Rollout</h2>
      <div className="mkt-timeline">
        <div className="mkt-phase"><div className="mkt-phase-tag mkt-phase-tag--now">Now</div><div><strong>Foundation.</strong> Catalog integrity, collection tools, grading, and valuation.</div></div>
        <div className="mkt-phase"><div className="mkt-phase-tag">Early access</div><div><strong>Controlled testing.</strong> Founding Collectors help test listings, trust, and support workflows.</div></div>
        <div className="mkt-phase"><div className="mkt-phase-tag">Public launch</div><div><strong>Open marketplace.</strong> Timing and final fees will be announced after early testing.</div></div>
      </div>

      <div className="mkt-bottom-cta">
        <h2>Want first dibs?</h2>
        <p>Join while a Founding Collector membership remains for free lifetime Pro and an invitation to early marketplace testing.</p>
        <div className="mkt-bottom-cta-row"><Link href="/founding-collectors" className="mkt-cta-primary">See remaining passes →</Link><Link href="/signup" className="mkt-cta-ghost">Sign up free</Link></div>
      </div>
    </section>
  );
}
