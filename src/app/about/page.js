import Link from "next/link";

export const metadata = {
  title: "What is ComixCatalog?",
  description:
    "ComixCatalog is what Discogs is for music — but for comic books. A community-built database and a personal collection manager today, with a peer-to-peer marketplace launching soon.",
};

const PILLARS = [
  {
    label: "Catalog",
    headline: "Every issue. Every printing. Every variant.",
    body:
      "A community-built database with deep coverage of every series, issue, and variant — newsstand vs. direct, slabbed vs. raw, original vs. reprint. Backed by the Grand Comics Database for metadata and ComicVine for cover imagery.",
  },
  {
    label: "Track",
    headline: "Your collection, in one place — accurately.",
    body:
      "Log condition, CGC/CBCS grade, slab cert numbers, what you paid, current market value, and notes. Generate insurance-ready PDF reports. See your portfolio over time.",
  },
  {
    label: "Transact",
    headline: "A marketplace built for collectors — launching soon.",
    body:
      "List books for sale, buy from other verified collectors, with seller ratings and verified-grade badges on slabbed copies. Less marketplace noise, more clarity around grade, variant, and condition. Launching soon, starting with Pro members.",
  },
];

const AUDIENCES = [
  {
    title: "Serious collectors",
    body:
      "Track every variant, newsstand vs. direct, CGC/CBCS slab grades and cert numbers, estimated values. Generate appraisal-ready PDF reports for insurance or estate planning.",
  },
  {
    title: "Casual collectors",
    body:
      "Find missing issues from a run you're building, browse key issues, see what other collectors own. Discover comics worth chasing.",
  },
  {
    title: "Sellers",
    body:
      "Once the marketplace launches, list key issues, newsstand books, or full collections, with Stripe-powered payouts and built-in reputation. In development now — see the marketplace page for rollout details.",
  },
];

export default function AboutPage() {
  return (
    <main className="gs-page">
      <header className="gs-hero">
        <p className="gs-kicker">About</p>
        <h1 className="gs-title">What is ComixCatalog?</h1>
        <p className="gs-lede">
          ComixCatalog is what Discogs is for music — but for comic books.
          A community-built database and a personal collection manager
          today, with a peer-to-peer marketplace launching soon.
        </p>
      </header>

      <section className="gs-section">
        <h2 className="gs-section-title">Why we&rsquo;re building this</h2>
        <p className="gs-questions-text">
          Comic collectors deserve better software. The existing options are
          either spreadsheets (powerful but tedious), price-guide apps
          (read-only, no community), or marketplaces (transactional, no
          collection tools). None of them treat the collector as the center
          of gravity.
        </p>
        <p className="gs-questions-text" style={{ marginTop: 14 }}>
          ComixCatalog is built collector-first. Every feature is designed
          around the question: <em>does this make tracking, valuing, or
          trading my collection meaningfully easier?</em> If the answer
          isn&rsquo;t obviously yes, it doesn&rsquo;t ship.
        </p>
      </section>

      <section className="gs-section">
        <h2 className="gs-section-title">Three things, done right</h2>
        <ul className="gs-coming">
          {PILLARS.map((p) => (
            <li key={p.label} className="gs-coming-item">
              <p
                style={{
                  fontSize: "0.7rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#f4d03f",
                  fontWeight: 700,
                  margin: "0 0 6px",
                }}
              >
                {p.label}
              </p>
              <h3 className="gs-coming-title" style={{ color: "#fff" }}>
                {p.headline}
              </h3>
              <p className="gs-coming-text">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="gs-section">
        <h2 className="gs-section-title">Who it&rsquo;s for</h2>
        <ul className="gs-coming">
          {AUDIENCES.map((a) => (
            <li key={a.title} className="gs-coming-item">
              <h3 className="gs-coming-title">{a.title}</h3>
              <p className="gs-coming-text">{a.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="gs-section">
        <h2 className="gs-section-title">Pricing</h2>
        <p className="gs-questions-text">
          There is one launch offer and one standard Pro price. The launch
          offer requires no card or payment.
        </p>
        <div className="tier-grid">
          <div className="tier-card tier-card-founding">
            <div className="tier-card-tag">Available now · First 100 members</div>
            <div className="tier-card-name">Founding Collector</div>
            <div className="tier-card-price">$0</div>
            <div className="tier-card-cadence">Collector Pro for life</div>
            <ul className="tier-card-list">
              <li><strong>Join while a membership remains</strong></li>
              <li>Pro access is added automatically</li>
              <li>No card or recurring payment</li>
              <li>Permanent Founding Collector badge</li>
            </ul>
            <Link href="/signup" className="tier-card-cta tier-card-cta-founding">
              Join and get lifetime Pro
            </Link>
          </div>

          <div className="tier-card tier-card-featured">
            <div className="tier-card-tag">Standard price after launch spots are gone</div>
            <div className="tier-card-name">Collector Pro</div>
            <div className="tier-card-price">$8</div>
            <div className="tier-card-cadence">per month</div>
            <ul className="tier-card-list">
              <li><strong>The same standard Pro toolkit</strong></li>
              <li>Insurance / appraisal PDF export</li>
              <li>CSV export (Discogs-style)</li>
              <li>Wantlist shopping-list PDF for cons</li>
              <li>Unlimited CSV import</li>
            </ul>
            <Link href="/founding-collectors" className="tier-card-cta tier-card-cta-primary">
              See remaining free memberships
            </Link>
          </div>
        </div>
        <p className="gs-questions-text" style={{ marginTop: 18, fontSize: "0.85rem", opacity: 0.7 }}>
          Basic membership remains free. Marketplace pricing will be published before seller tools open; no marketplace fee is charged today.
        </p>
      </section>

      <section className="gs-section">
        <h2 className="gs-section-title">Where it comes from</h2>
        <p className="gs-questions-text">
          ComixCatalog is being built independently in Chicago by a
          collector. No VC, no acquisition pressure, no mandate to
          monetize-then-figure-it-out. Just a long-term commitment to
          building the platform comic collectors actually want.
        </p>
        <p className="gs-questions-text" style={{ marginTop: 14 }}>
          The first 100 members become <strong>Founding Collectors</strong> and
          receive Collector Pro for life automatically. Create an account
          while memberships remain—no card required.
        </p>
        <div style={{ marginTop: 20 }}>
          <Link
            href="/founding-collectors"
            className="gs-btn gs-btn-primary"
          >
            See Remaining Passes
          </Link>
        </div>
      </section>

      <section className="gs-section">
        <h2 className="gs-section-title">What&rsquo;s next</h2>
        <p className="gs-questions-text">
          We&rsquo;re working toward an integrated platform where you can:
        </p>
        <ul
          style={{
            margin: "16px 0 0",
            paddingLeft: "1.4rem",
            lineHeight: 1.7,
            color: "rgba(255, 255, 255, 0.78)",
          }}
        >
          <li>Search any comic series or issue.</li>
          <li>
            Add it to your collection with grade, condition, variant type,
            and notes.
          </li>
          <li>See your collection&rsquo;s estimated value over time.</li>
          <li>
            Generate a PDF report suitable for insurance or estate
            planning.
          </li>
          <li>List books for sale and complete transactions with other collectors.</li>
          <li>Get alerted when a wantlist issue drops to your target price.</li>
          <li>
            See what key issues you&rsquo;re missing from a run you&rsquo;re
            building.
          </li>
        </ul>
      </section>

      <section className="gs-final-cta">
        <h2 className="gs-final-title">Ready to start your collection?</h2>
        <div className="gs-final-actions">
          <Link href="/get-started" className="gs-btn gs-btn-primary">
            Get started
          </Link>
          <Link href="/search" className="gs-btn gs-btn-secondary">
            Browse the database
          </Link>
        </div>
      </section>
    </main>
  );
}
