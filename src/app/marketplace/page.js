import Link from "next/link";

export const metadata = {
  title: "Marketplace — Coming 2027",
  description:
    "The collector-first comic marketplace. Verified grades, transparent fees, no consignment middlemen. Founding Collectors get 3% fees locked in for life and first access.",
};

export default function MarketplacePage() {
  return (
    <section className="marketplace-page">
      {/* Hero ── lead with the timeline so visitors aren't confused why
          they can't list right now. Was the #1 friction point on the old
          page: looked like a live marketplace, only the bottom panel
          revealed it wasn't. */}
      <div className="mkt-hero">
        <div className="mkt-status-pill">In development &middot; Opening 2027</div>
        <h1 className="mkt-title">A marketplace built around grade, not guesswork.</h1>
        <p className="mkt-lede">
          eBay treats comics like garage-sale random. Mercari can&rsquo;t tell a slab
          from a sticker. We&rsquo;re building the alternative: every listing tied to a
          verified collection entry, cert numbers linked to live CGC/CBCS registries,
          and fees that don&rsquo;t punish you for selling your own books.
        </p>

        <div className="mkt-hero-ctas">
          <Link href="/upgrade" className="mkt-cta-primary">
            Get marketplace priority &rarr;
          </Link>
          <Link href="/signup" className="mkt-cta-ghost">
            Or just sign up to get notified
          </Link>
        </div>
        <div className="mkt-hero-fineprint">
          Founding Collectors ($20/mo) get first access and a permanent 3% fee
          when it opens.
        </div>
      </div>

      {/* What makes it different ── concrete, specific. The old generic
          "Verified Sellers / Grade Transparency / Search by What Matters"
          read like SaaS landing-page filler. */}
      <h2 className="mkt-section-title">What&rsquo;s different about it</h2>
      <div className="mkt-pillars">
        <div className="mkt-pillar">
          <div className="mkt-pillar-num">01</div>
          <h3>Every listing is a real catalog entry</h3>
          <p>
            Sellers list directly from their tracked collection. No vague titles,
            no missing issue numbers, no &ldquo;HUGE LOT MUST SEE&rdquo; junk.
            Buyers know exactly what they&rsquo;re bidding on.
          </p>
        </div>
        <div className="mkt-pillar">
          <div className="mkt-pillar-num">02</div>
          <h3>Slab certs verified live</h3>
          <p>
            CGC and CBCS cert numbers link to the real registry. No more
            photoshopped grade labels. The slab in the photo is the slab in the
            listing.
          </p>
        </div>
        <div className="mkt-pillar">
          <div className="mkt-pillar-num">03</div>
          <h3>Fees that respect collectors</h3>
          <p>
            5&ndash;8% standard for everyone (vs. eBay&rsquo;s 12&ndash;15% by the
            time fees stack). Founding Collectors lock in 3% forever &mdash;
            permanently, even after public launch.
          </p>
        </div>
        <div className="mkt-pillar">
          <div className="mkt-pillar-num">04</div>
          <h3>Built for runs and keys, not Pokémon cards</h3>
          <p>
            Search by issue, variant, grade, year, publisher, creator. Filter
            for newsstand vs. direct. Sort by run-completion gap. The kind of
            filtering eBay categorically cannot do.
          </p>
        </div>
      </div>

      {/* Fee comparison ── shows the math, makes it concrete */}
      <h2 className="mkt-section-title">Why the fee structure matters</h2>
      <div className="mkt-fees">
        <div className="mkt-fee-row mkt-fee-row--head">
          <div>Platform</div>
          <div>Per-sale fees</div>
          <div>On a $200 sale, you keep</div>
        </div>
        <div className="mkt-fee-row">
          <div>eBay (typical)</div>
          <div>~13.6% + $0.30</div>
          <div>~$172</div>
        </div>
        <div className="mkt-fee-row">
          <div>Mercari</div>
          <div>10% + 2.9% payment</div>
          <div>~$172</div>
        </div>
        <div className="mkt-fee-row">
          <div>ComixCatalog &mdash; standard</div>
          <div>5&ndash;8%</div>
          <div>~$184&ndash;$190</div>
        </div>
        <div className="mkt-fee-row mkt-fee-row--highlight">
          <div>ComixCatalog &mdash; Founding Collector</div>
          <div>3% (locked in)</div>
          <div>~$194</div>
        </div>
      </div>

      {/* Timeline ── be explicit so the visitor knows when to come back */}
      <h2 className="mkt-section-title">Timeline</h2>
      <div className="mkt-timeline">
        <div className="mkt-phase">
          <div className="mkt-phase-tag mkt-phase-tag--now">Now</div>
          <div>
            <strong>Collector tools.</strong> Building the catalog, grading, and
            valuation foundation so listings have real metadata to lean on.
          </div>
        </div>
        <div className="mkt-phase">
          <div className="mkt-phase-tag">Q4 2026</div>
          <div>
            <strong>Founding Collector early access.</strong> Private marketplace
            for Founding Collectors to list, browse, and transact. Bug-stomping
            phase.
          </div>
        </div>
        <div className="mkt-phase">
          <div className="mkt-phase-tag">2027</div>
          <div>
            <strong>Open to all verified Pro members.</strong> Public launch
            after the early-access cohort proves out the trust model.
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="mkt-bottom-cta">
        <h2>Want first dibs?</h2>
        <p>
          Founding Collectors ($20/mo, limited to first 100) get marketplace
          access before anyone else, plus 3% fees locked in for life.
        </p>
        <div className="mkt-bottom-cta-row">
          <Link href="/upgrade" className="mkt-cta-primary">
            See Founding Collector &rarr;
          </Link>
          <Link href="/signup" className="mkt-cta-ghost">
            Or sign up free &mdash; we&rsquo;ll email when it opens
          </Link>
        </div>
      </div>
    </section>
  );
}
