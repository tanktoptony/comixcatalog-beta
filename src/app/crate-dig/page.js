import Link from "next/link";

// /crate-dig — in-person Chicago meetup landing page.
//
// Placeholders to fill in before going live (search for "TODO:"):
//   • EVENT_DATE, EVENT_TIME, VENUE_NAME, VENUE_ADDRESS
//   • CAPACITY (or remove the "limited to N" line)
//   • RSVP target (currently mailto:, swap for Eventbrite/Lu.ma if needed)
//
// Keep this page live after the event — turn it into a recap with photos
// and add an "Up next" pointer for the following dig. Recurring event
// pages build SEO and signal "we do this regularly" to collectors deciding
// whether to follow the project.

// TODO: fill in real values before launch
const EVENT_DATE = "Saturday, June 21, 2026";
const EVENT_TIME = "1:00 PM – 5:00 PM CT";
const VENUE_NAME = "TBA — Chicago comic shop partner";
const VENUE_ADDRESS = "Chicago, IL · address dropped with RSVP";
const CAPACITY_NOTE = "Limited to 30 collectors — first come, first served.";
const RSVP_HREF = "mailto:comixcatalog@gmail.com?subject=Crate%20Dig%20RSVP&body=Count%20me%20in.%20Name%3A%20%0AInstagram%2Fhandle%20(optional)%3A%20%0AAnything%20you%27re%20hunting%20for%3F%3A%20";

export const metadata = {
  title: "Crate Dig — Chicago",
  description:
    "An in-person comic crate dig in Chicago, hosted by ComixCatalog. Bring your wantlist, dig through long boxes, log your hauls together.",
};

export default function CrateDigPage() {
  return (
    <main className="cd-page">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="cd-hero">
        <div className="cd-status-pill">
          <span className="cd-pill-dot" aria-hidden="true" />
          Chicago · {EVENT_DATE}
        </div>
        <h1 className="cd-title">
          Bring your wantlist.<br />
          Dig the crates.<br />
          Log the haul.
        </h1>
        <p className="cd-lede">
          A real-world afternoon of long-box digging with other collectors. Bring
          a list of what you&rsquo;re hunting (or pull it up on your phone from
          your ComixCatalog wantlist), spend the afternoon flipping through
          boxes, then we&rsquo;ll log everyone&rsquo;s pulls together at the end.
        </p>

        <div className="cd-meta-grid">
          <div className="cd-meta-card">
            <div className="cd-meta-label">When</div>
            <div className="cd-meta-value">{EVENT_DATE}</div>
            <div className="cd-meta-sub">{EVENT_TIME}</div>
          </div>
          <div className="cd-meta-card">
            <div className="cd-meta-label">Where</div>
            <div className="cd-meta-value">{VENUE_NAME}</div>
            <div className="cd-meta-sub">{VENUE_ADDRESS}</div>
          </div>
          <div className="cd-meta-card">
            <div className="cd-meta-label">Capacity</div>
            <div className="cd-meta-value">RSVP required</div>
            <div className="cd-meta-sub">{CAPACITY_NOTE}</div>
          </div>
        </div>

        <div className="cd-hero-ctas">
          <a href={RSVP_HREF} className="cd-cta-primary">
            RSVP &rarr;
          </a>
          <Link href="/signup" className="cd-cta-ghost">
            Don&rsquo;t have an account? Sign up free first
          </Link>
        </div>
      </section>

      {/* ── WHAT TO EXPECT ───────────────────────────────────── */}
      <section className="cd-section">
        <h2 className="cd-section-title">What to expect</h2>
        <div className="cd-pillars">
          <div className="cd-pillar">
            <div className="cd-pillar-icon">📦</div>
            <h3>Real long boxes, real digging</h3>
            <p>
              Our partner shop is opening crates that don&rsquo;t usually hit the
              wall &mdash; back-issue overstock, recent buys, dollar boxes, key
              books from the case. Quarter-bins to four-figure slabs.
            </p>
          </div>
          <div className="cd-pillar">
            <div className="cd-pillar-icon">📋</div>
            <h3>Wantlists, weaponized</h3>
            <p>
              Pull your ComixCatalog wantlist up on your phone before you start
              digging. Sort by publisher, by run, by what&rsquo;s closest to
              completion. No more &ldquo;wait, did I already buy this one?&rdquo;
            </p>
          </div>
          <div className="cd-pillar">
            <div className="cd-pillar-icon">🏷️</div>
            <h3>Group log + show-and-tell</h3>
            <p>
              Last hour: everyone shares their pulls. We log them into the app
              together so you walk out with your collection updated and your
              run-completion bumps in writing.
            </p>
          </div>
          <div className="cd-pillar">
            <div className="cd-pillar-icon">🤝</div>
            <h3>Trades + want-list swaps</h3>
            <p>
              Bring books to trade. If your wantlist overlaps with someone
              else&rsquo;s collection, this is the room to make a deal. No fees,
              no shipping, no eBay roulette.
            </p>
          </div>
        </div>
      </section>

      {/* ── WHAT TO BRING ────────────────────────────────────── */}
      <section className="cd-section">
        <h2 className="cd-section-title">What to bring</h2>
        <ul className="cd-bring-list">
          <li>
            <strong>Your phone</strong> &mdash; logged into ComixCatalog with
            your wantlist ready
          </li>
          <li>
            <strong>Cash + a card</strong> &mdash; the host shop accepts both;
            cash often unlocks better dollar-box deals
          </li>
          <li>
            <strong>Books to trade</strong> (optional) &mdash; bagged + boarded
            preferred, with a sticky-note grade if you have one
          </li>
          <li>
            <strong>Tote, backpack, or box</strong> &mdash; long boxes are not
            kind to plastic grocery bags
          </li>
          <li>
            <strong>An open mind on a couple stretch keys</strong> &mdash; the
            best digs happen when you&rsquo;re willing to follow a tangent
          </li>
        </ul>
      </section>

      {/* ── SHARE / SOCIAL ───────────────────────────────────── */}
      <section className="cd-section">
        <h2 className="cd-section-title">Spread the word</h2>
        <p className="cd-share-body">
          Bringing a friend who&rsquo;s into comics? Tell them. Posting about
          the dig?
        </p>
        <div className="cd-tag-row">
          <code className="cd-tag">#ComixCatalogCrateDig</code>
          <code className="cd-tag">@comixcatalog</code>
        </div>
        <p className="cd-share-sub">
          Tag us and we&rsquo;ll repost the best hauls afterwards.
        </p>
      </section>

      {/* ── BOTTOM RSVP ──────────────────────────────────────── */}
      <section className="cd-bottom">
        <h2>See you in the long boxes.</h2>
        <p>
          RSVP&rsquo;d spots get the venue address the day before. First dig of
          what we hope is a regular Chicago thing &mdash; come help start it.
        </p>
        <div className="cd-bottom-cta-row">
          <a href={RSVP_HREF} className="cd-cta-primary">
            RSVP for {EVENT_DATE.split(",")[0]} &rarr;
          </a>
          <Link href="/upgrade" className="cd-cta-ghost">
            Or become a Founding Collector
          </Link>
        </div>
      </section>
    </main>
  );
}
