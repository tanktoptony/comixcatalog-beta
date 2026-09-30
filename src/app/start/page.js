import Image from "next/image";
import Link from "next/link";
import { getFoundingRemaining } from "@/lib/foundingStatus";
import { StartTracker, StartPrimaryCta } from "./StartClient";
import styles from "./start.module.css";

import xmen1991 from "../../../public/img/start/x-men-1-1991.webp";
import giantSize from "../../../public/img/start/giant-size-x-men-1.webp";
import uncanny266 from "../../../public/img/start/uncanny-x-men-266.webp";
import absoluteBatman from "../../../public/img/start/absolute-batman-1.webp";
import saga1 from "../../../public/img/start/saga-1.webp";

// /start — the destination for Instagram traffic (bio link, pinned posts,
// Story link stickers). One job: get a collector from "what is this" to an
// account with a comic in it. Kept deliberately short, server-rendered, and
// light: five local WebP covers (≈280KB total at full size, served resized by
// next/image), and the only client JS is StartClient.js.
//
// Everything shown here is a feature that works today. Before adding a
// claim, check it against the live product, not the roadmap.
//
// Bio link: https://comixcatalog.com/start?utm_source=instagram&utm_medium=social&utm_campaign=profile

export const metadata = {
  title: "Start your collection",
  description:
    "Your comic collection, online. Catalog your books, build your wantlist, and see what's missing. Free.",
  // One canonical URL no matter which utm_* variant brought the visitor.
  alternates: { canonical: "/start" },
  openGraph: {
    title: "Your comic collection. Online. | ComixCatalog",
    description: "Catalog your books. Build your wantlist. Discover what's missing.",
    url: "/start",
  },
};

const COVER_SIZES = "(max-width: 640px) 34vw, 180px";

const BENEFITS = [
  {
    title: "Know what you own",
    body: "Every book organized by series and issue, with grade, slab, and what you paid if you want it.",
  },
  {
    title: "Know what you're missing",
    body: "Put the gaps on your wantlist and see how close you are to finishing a run.",
  },
  {
    title: "Take it to the shop",
    body: "Check your list on your phone while you dig through the back-issue bins or walk a con floor.",
  },
  {
    title: "Show it off",
    body: "Your collection gets a public profile and a share card sized for your Story. Private if you'd rather.",
  },
];

export default async function StartPage() {
  const foundingRemaining = await getFoundingRemaining();
  const foundingOpen = Number.isFinite(foundingRemaining) && foundingRemaining > 0;

  return (
    <div className={styles.page}>
      <StartTracker />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className={styles.hero} aria-labelledby="start-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>ComixCatalog</p>
          <h1 id="start-title" className={styles.h1}>
            Your comic collection. <span className={styles.gold}>Online.</span>
          </h1>
          <p className={styles.lede}>
            Catalog your books. Build your wantlist. Discover what&rsquo;s missing.
          </p>
          <div className={styles.ctas}>
            <StartPrimaryCta location="hero" className={styles.ctaPrimary} />
            <Link
              href="/search"
              className={styles.ctaSecondary}
              data-start-cta="search"
              data-start-location="hero"
            >
              Search Comics
            </Link>
          </div>
        </div>

        <div className={styles.fan} aria-hidden="true">
          <Image src={giantSize} alt="" sizes={COVER_SIZES} className={`${styles.fanCover} ${styles.fanLeft}`} priority />
          <Image src={xmen1991} alt="" sizes={COVER_SIZES} className={`${styles.fanCover} ${styles.fanMid}`} priority />
          <Image src={uncanny266} alt="" sizes={COVER_SIZES} className={`${styles.fanCover} ${styles.fanRight}`} priority />
        </div>
      </section>

      {/* ── How it works (doubles as the product demo) ───── */}
      <section className={styles.section} aria-labelledby="how-title">
        <h2 id="how-title" className={styles.h2}>How it works</h2>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <div className={styles.stepHead}>
              <span className={styles.stepNum} aria-hidden="true">1</span>
              <div>
                <h3 className={styles.h3}>Search</h3>
                <p className={styles.stepText}>Find the series or issue.</p>
              </div>
            </div>
            <div className={styles.mock} aria-hidden="true">
              <div className={styles.mockSearch}>
                <span className={styles.mockSearchIcon}>⌕</span> x-men
              </div>
              <ul className={styles.mockResults}>
                <li>
                  <Image src={xmen1991} alt="" width={36} height={54} className={styles.mockThumb} />
                  <span><strong>X-Men</strong> (1991)<br /><small>Marvel</small></span>
                </li>
                <li>
                  <Image src={giantSize} alt="" width={36} height={54} className={styles.mockThumb} />
                  <span><strong>Giant-Size X-Men</strong> (1975)<br /><small>Marvel</small></span>
                </li>
                <li>
                  <Image src={uncanny266} alt="" width={36} height={54} className={styles.mockThumb} />
                  <span><strong>The Uncanny X-Men</strong> (1963)<br /><small>Marvel</small></span>
                </li>
              </ul>
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.stepHead}>
              <span className={styles.stepNum} aria-hidden="true">2</span>
              <div>
                <h3 className={styles.h3}>Collect</h3>
                <p className={styles.stepText}>Add it to your collection or your wantlist.</p>
              </div>
            </div>
            <div className={`${styles.mock} ${styles.mockIssue}`} aria-hidden="true">
              <Image src={xmen1991} alt="" width={96} height={144} className={styles.mockIssueCover} />
              <div className={styles.mockIssueBody}>
                <strong>X-Men #1</strong>
                <small>Marvel · 1991</small>
                <span className={`${styles.mockBtn} ${styles.mockBtnOn}`}>✓ In Collection</span>
                <span className={styles.mockBtn}>+ Wantlist</span>
              </div>
            </div>
          </li>

          <li className={styles.step}>
            <div className={styles.stepHead}>
              <span className={styles.stepNum} aria-hidden="true">3</span>
              <div>
                <h3 className={styles.h3}>Build</h3>
                <p className={styles.stepText}>Watch your collection grow, and share it.</p>
              </div>
            </div>
            <div className={`${styles.mock} ${styles.mockProfile}`} aria-hidden="true">
              <div className={styles.mockProfileHead}>
                <span className={styles.mockAvatar}>Y</span>
                <span><strong>your_name</strong><br /><small>comixcatalog.com/u/your_name</small></span>
              </div>
              <div className={styles.mockShelf}>
                {[xmen1991, giantSize, uncanny266, absoluteBatman, saga1].map((src, i) => (
                  <Image key={i} src={src} alt="" width={44} height={66} className={styles.mockShelfCover} />
                ))}
              </div>
              <div className={styles.mockStats}>
                <span><strong>5</strong> comics</span>
                <span><strong>5</strong> series</span>
                <span><strong>3</strong> wanted</span>
              </div>
            </div>
          </li>
        </ol>
      </section>

      {/* ── Collector benefits ───────────────────────────── */}
      <section className={styles.section} aria-labelledby="why-title">
        <h2 id="why-title" className={styles.h2}>Built for how collectors actually collect</h2>
        <ul className={styles.benefits}>
          {BENEFITS.map((b) => (
            <li key={b.title} className={styles.benefit}>
              <h3 className={styles.h3}>{b.title}</h3>
              <p className={styles.benefitText}>{b.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Founding collectors ──────────────────────────── */}
      <section className={`${styles.section} ${styles.founding}`} aria-labelledby="built-title">
        <h2 id="built-title" className={styles.h2}>Built with comic collectors</h2>
        <p className={styles.foundingText}>
          ComixCatalog is built by a collector, alongside the collectors using it.
          Tell us what&rsquo;s missing and it goes on the list.
        </p>
        {foundingOpen && (
          <p className={styles.foundingOffer}>
            <span className={styles.foundingBadge}>Founding Collector</span>
            The first 100 accounts get the badge and lifetime Pro, free.{" "}
            <strong>{foundingRemaining} left.</strong>{" "}It&rsquo;s automatic when you sign up.
          </p>
        )}
      </section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <section className={styles.final} aria-labelledby="final-title">
        <h2 id="final-title" className={styles.finalTitle}>No spreadsheet required.</h2>
        <StartPrimaryCta location="final" className={styles.ctaPrimary} />
      </section>
    </div>
  );
}
