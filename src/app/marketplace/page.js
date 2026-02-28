export default function MarketplacePage() {
  return (
    <section className="comic-panel marketplace-page">
      {/* Section Label */}
      <div className="section-label badge-x">Marketplace</div>

      {/* Hero Title */}
      <h1 className="hero-title mb-6">
        Collector Marketplace
      </h1>

      {/* Intro */}
      <p className="hero-subtext mb-10">
        A transparent, collector-first marketplace built around grade,
        variant, and verified ownership — not vague “VG-ish” listings.
      </p>

      {/* Feature Blocks */}
      <div className="feature-grid">
        <div className="feature-block">
          <h3>Verified Sellers</h3>
          <p>
            Only verified collectors can list. Listings are tied to real
            collection entries.
          </p>
        </div>

        <div className="feature-block">
          <h3>Grade Transparency</h3>
          <p>
            CGC/graded copies clearly marked. Raw copies include condition
            notes and high-resolution photos.
          </p>
        </div>

        <div className="feature-block">
          <h3>Search by What Matters</h3>
          <p>
            Filter by issue, variant, grade, publisher, and creator —
            not just title.
          </p>
        </div>
      </div>

      {/* Current Focus Panel */}
      <div className="coming-soon-panel mt-12">
        <h2>Currently in Development</h2>
        <p>
          We’re building the collector tools and early verified seller
          network first. Marketplace access will open to Founding
          Collectors before public launch.
        </p>

        <a href="https://www.patreon.com/cw/ComixCatalog" className="primary-btn mt-4">
          Become a Founding Collector
        </a>
      </div>
    </section>
  );
}