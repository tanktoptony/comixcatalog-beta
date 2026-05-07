import Link from "next/link";

export const metadata = {
  title: "Help Center — ComixCatalog",
};

export default function HelpPage() {
  return (
    <main className="page">
      <section className="cc-form-card" style={{ maxWidth: 640 }}>
        <h1 className="cc-form-title">Help Center</h1>
        <p className="cc-form-sub">
          ComixCatalog is in active development by a solo team. The fastest way
          to get a real answer is direct contact — email or Discord, both read
          daily.
        </p>

        <ul className="help-channels">
          <HelpChannel
            label="Email"
            value="comixcatalog@gmail.com"
            href="mailto:comixcatalog@gmail.com"
            note="Best for bug reports, account issues, anything you'd rather not say in public."
          />
          <HelpChannel
            label="Discord"
            value="discord.gg/aQruGVnD3y"
            href="https://discord.gg/aQruGVnD3y"
            external
            note="Real-time community + support. Quickest for short questions and feature ideas."
          />
          <HelpChannel
            label="Status"
            value="comixcatalog.com/status"
            href="/status"
            note="Live operational state. Check here first if something looks broken."
          />
        </ul>

        <h2 className="md-h2" style={{ marginTop: 32 }}>Common questions</h2>

        <div className="help-faq">
          <FaqItem
            q="How do I add a comic to my collection?"
            a={
              <>
                Search for the issue or series, open the issue page, and click{" "}
                <strong>Add to Collection</strong>. From there you can record
                grade, slab cert number, purchase price, and notes via the
                inline grade editor.
              </>
            }
          />
          <FaqItem
            q="How do I track a comic on my wantlist?"
            a={
              <>
                Same flow as collection, but click{" "}
                <strong>Add to Wishlist</strong> instead. Your wantlist is
                visible on your public profile (unless you turn that off in
                profile privacy settings).
              </>
            }
          />
          <FaqItem
            q="Why is a cover missing on a series page?"
            a={
              <>
                Cover ingestion runs from ComicVine over time. If a run hasn't
                been pulled yet, individual issues will show without art. The
                rest of the data (issue numbers, dates, publishers) comes from
                the Grand Comics Database.
              </>
            }
          />
          <FaqItem
            q="When does the marketplace open?"
            a={
              <>
                Phase 2, targeting late May 2026. It launches Pro-only with
                slabbed listings first; raw listings open after the trust
                infrastructure is in place. Founding Collectors get the lowest
                fee tier permanently.
              </>
            }
          />
          <FaqItem
            q="How do I delete my account?"
            a={
              <>
                Email <a href="mailto:comixcatalog@gmail.com" className="md-a">comixcatalog@gmail.com</a>{" "}
                from your account address and your data will be wiped within 7
                days, per the privacy policy.
              </>
            }
          />
        </div>

        <p className="cc-hint" style={{ marginTop: 28 }}>
          Don&rsquo;t see your question? Email or Discord — answers usually
          come the same day.
        </p>

        <div style={{ marginTop: 24 }}>
          <Link href="/" className="cc-submit">
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}

function HelpChannel({ label, value, href, external, note }) {
  const linkProps = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
  const Tag = external || href.startsWith("mailto:") ? "a" : Link;
  return (
    <li className="help-channel">
      <span className="help-channel-label">{label}</span>
      <Tag href={href} className="help-channel-link" {...linkProps}>
        {value}
      </Tag>
      <span className="help-channel-note">{note}</span>
    </li>
  );
}

function FaqItem({ q, a }) {
  return (
    <details className="help-faq-item">
      <summary>{q}</summary>
      <div className="help-faq-answer">{a}</div>
    </details>
  );
}
