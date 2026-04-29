import Link from "next/link";

export const metadata = {
  title: "Get Started · ComixCatalog",
  description:
    "How to use ComixCatalog to track your comic collection — search, add, grade, and share.",
};

const STEPS = [
  {
    n: 1,
    title: "Create your account",
    body: (
      <>
        Pick a username and confirm your email. Your username becomes your
        public profile URL at <code>comixcatalog.com/u/&lt;username&gt;</code> —
        choose something you&rsquo;d be happy to share with other collectors.
      </>
    ),
    cta: { label: "Sign up", href: "/signup" },
  },
  {
    n: 2,
    title: "Find your comics",
    body: (
      <>
        Search by series, issue, publisher, or character. Don&rsquo;t have one
        in mind? The search landing page surfaces curated featured series —
        Batman, Spider-Man, X-Men, and the deepest collector runs first.
      </>
    ),
    cta: { label: "Open Search", href: "/search" },
  },
  {
    n: 3,
    title: "Add it to your library",
    body: (
      <>
        Every issue card has two buttons:{" "}
        <strong>+&nbsp;Collection</strong> (you own it) and{" "}
        <strong>+&nbsp;Wantlist</strong> (you&rsquo;re hunting for it).
        Wantlist items get notifications when a seller lists them.
      </>
    ),
    cta: { label: "Add a Comic", href: "/contribute/add-comic" },
  },
  {
    n: 4,
    title: "Grade and track condition",
    body: (
      <>
        Click <strong>Edit grade</strong> on any item to record raw
        condition (VF, NM&hellip;) or a numeric CGC/CBCS grade, slab cert
        number, what you paid, current market value, and notes. Your full
        collector record, in one place.
      </>
    ),
  },
  {
    n: 5,
    title: "View your library",
    body: (
      <>
        Tabs for <strong>Owned</strong>, <strong>Wantlist</strong>, and{" "}
        <strong>For Sale</strong>. Filters by publisher, era, and slab
        status. List or grid view. Filter inside your collection with the
        search bar.
      </>
    ),
    cta: { label: "Open Library", href: "/library" },
  },
  {
    n: 6,
    title: "Share your profile",
    body: (
      <>
        Your public collection lives at{" "}
        <code>comixcatalog.com/u/&lt;username&gt;</code>. Cover grid, total
        value, top publishers, badges. A Discogs-style identity for your
        collection. Send the link to a fellow collector or post it
        anywhere. Want it private? Account Settings → Privacy.
      </>
    ),
  },
];

const COMING_SOON = [
  {
    title: "Insurance / appraisal PDF",
    body:
      "One-click itemized PDF of your collection with cover thumbs and totals — date-stamped, ready for an insurer or estate planner. Pro feature.",
  },
  {
    title: "Marketplace",
    body:
      "List books for sale, buy from other collectors, with seller ratings and a verified-grade badge for slabbed copies.",
  },
  {
    title: "Want-list price alerts",
    body:
      "Get pinged when an issue you want is listed at or below your target price.",
  },
  {
    title: "Run-completion stats",
    body:
      '"You own 11 of 15 Uncanny X-Men key issues — here are the 4 you\'re missing."',
  },
];

export default function GetStartedPage() {
  return (
    <main className="gs-page">
      <header className="gs-hero">
        <p className="gs-kicker">Welcome</p>
        <h1 className="gs-title">Get Started with ComixCatalog</h1>
        <p className="gs-lede">
          ComixCatalog is what Discogs is for music — but for comic books.
          Database, library, marketplace. Here&rsquo;s a five-minute tour.
        </p>
      </header>

      <ol className="gs-steps">
        {STEPS.map((step) => (
          <li key={step.n} className="gs-step">
            <div className="gs-step-num" aria-hidden="true">
              {step.n}
            </div>
            <div className="gs-step-body">
              <h2 className="gs-step-title">{step.title}</h2>
              <p className="gs-step-text">{step.body}</p>
              {step.cta && (
                <Link href={step.cta.href} className="gs-step-cta">
                  {step.cta.label}
                  <span className="gs-step-cta-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>

      <section className="gs-section">
        <h2 className="gs-section-title">What&rsquo;s coming next</h2>
        <ul className="gs-coming">
          {COMING_SOON.map((c) => (
            <li key={c.title} className="gs-coming-item">
              <h3 className="gs-coming-title">{c.title}</h3>
              <p className="gs-coming-text">{c.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="gs-section gs-questions">
        <h2 className="gs-section-title">Questions?</h2>
        <p className="gs-questions-text">
          The collector community lives on{" "}
          <a
            href="https://discord.gg/aQruGVnD3y"
            target="_blank"
            rel="noreferrer"
          >
            Discord
          </a>{" "}
          and{" "}
          <a
            href="https://www.reddit.com/r/comixcatalog"
            target="_blank"
            rel="noreferrer"
          >
            r/comixcatalog
          </a>
          . For everything else,{" "}
          <a href="mailto:comixcatalog@gmail.com">email us directly</a>.
        </p>
      </section>

      <section className="gs-final-cta">
        <h2 className="gs-final-title">Ready to start your collection?</h2>
        <div className="gs-final-actions">
          <Link href="/signup" className="gs-btn gs-btn-primary">
            Create your account
          </Link>
          <Link href="/search" className="gs-btn gs-btn-secondary">
            Browse the database
          </Link>
        </div>
      </section>
    </main>
  );
}
