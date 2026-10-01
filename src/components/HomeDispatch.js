import Link from "next/link";
import { coverThumb } from "@/lib/coverThumb";

// Homepage "Dispatch": signs of life (covers landing this week, blog posts,
// site updates) next to a short note from the founder with the sign-up
// call to action. Replaced the "Recent Collector Activity" box, which with
// a small user base mostly showed the admin account's own wishlist.
// Data comes from src/lib/homeDispatch.js, rendered on the server.

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const KIND_LABEL = { update: "Site update", read: "Read" };

export default function HomeDispatch({ newCovers, feed = [], ctaHref, ctaLabel, onCta }) {
  return (
    <section className="dispatch" aria-labelledby="dispatch-title">
      <div className="dispatch-head">
        <p className="dispatch-kicker">What&rsquo;s happening</p>
        <h2 id="dispatch-title" className="dispatch-title">The Dispatch</h2>
      </div>

      <div className="dispatch-grid">
        <div className="dispatch-feed">
          {newCovers?.strip?.length > 0 && (
            <article className="dispatch-card dispatch-covers">
              <div className="dispatch-meta">
                <span className="dispatch-chip dispatch-chip-live">New covers</span>
                <span>Last 7 days</span>
              </div>
              <h3 className="dispatch-card-title">
                {newCovers.added > 0
                  ? `${newCovers.added.toLocaleString("en-US")} covers added this week`
                  : "Fresh covers just landed"}
              </h3>
              <div className="dispatch-strip">
                {newCovers.strip.map((c) => {
                  const img = (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverThumb(c.cover)} alt={c.title} loading="lazy" />
                  );
                  return c.href ? (
                    <Link prefetch={false} key={c.cover} href={c.href} className="dispatch-strip-item" title={c.title}>
                      {img}
                    </Link>
                  ) : (
                    <span key={c.cover} className="dispatch-strip-item" title={c.title}>
                      {img}
                    </span>
                  );
                })}
              </div>
            </article>
          )}

          {feed.map((item) => {
            const inner = (
              <>
                <div className="dispatch-meta">
                  <span className={`dispatch-chip dispatch-chip-${item.kind}`}>{KIND_LABEL[item.kind] ?? "News"}</span>
                  <span>{formatDate(item.date)}</span>
                </div>
                <h3 className="dispatch-card-title">{item.title}</h3>
                {item.body && <p className="dispatch-card-body">{item.body}</p>}
              </>
            );
            return item.href ? (
              <Link prefetch={false} key={`${item.kind}-${item.title}`} href={item.href} className="dispatch-card dispatch-link">
                {inner}
              </Link>
            ) : (
              <article key={`${item.kind}-${item.title}`} className="dispatch-card">
                {inner}
              </article>
            );
          })}

          <Link prefetch={false} href="/blog" className="dispatch-more">
            All posts and updates →
          </Link>
        </div>

        <aside className="dispatch-note" aria-label="A note from the founder">
          <p className="dispatch-note-kicker">Who we are</p>
          <h3 className="dispatch-note-title">Hey, I&rsquo;m Anthony.</h3>
          <p>
            I fell for X-Men at eight years old in Chicagoland, drifted away
            like a lot of us do, and came back years later when a guy at
            Graham Crackers handed me House of M.
          </p>
          <p>
            My system for tracking what I owned was a notebook and a bad
            memory. So I built ComixCatalog: every issue, every cover, and
            what your books are actually worth.
          </p>
          <p>
            It&rsquo;s one collector building the tool he wanted, out in the
            open. If something&rsquo;s missing or wrong, tell me. I read
            everything.
          </p>
          <div className="dispatch-note-actions">
            <Link href={ctaHref} className="lp-cta-primary" onClick={onCta}>
              {ctaLabel}
            </Link>
            <a href="mailto:comixcatalog@gmail.com" className="dispatch-note-link">
              Say hi →
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}
