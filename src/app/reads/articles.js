// Editorial articles for /reads. Hardcoded for now — when the editorial
// volume justifies a CMS or DB-backed posts table we'll migrate. Each
// article exports: slug, title, kicker, dek (subtitle), publishedAt,
// readingTime, and a `body` JSX getter so we can stay in MDX-style without
// pulling in MDX tooling yet.

import React from "react";

const ARTICLES = [
  {
    slug: "how-to-grade-raw-comics",
    kicker: "Collecting 101",
    title: "How to Grade Your Raw Comics: A Beginner's Guide",
    dek: "Before you slab anything or list it for sale, learn what graders actually look at — and how to do a credible self-grade in five minutes.",
    publishedAt: "2026-04-28",
    readingTime: "6 min read",
    body: () => (
      <>
        <p>
          Every conversation about a raw comic&rsquo;s value starts with the
          same question: <em>what condition is it in?</em> Two copies of
          Amazing Spider-Man #129 — same printing, same year — can sell for
          $200 or $2,000 depending entirely on grade. Learning to assess your
          books accurately, before you ever send anything to CGC or list it on
          a marketplace, is the single highest-leverage skill in collecting.
        </p>

        <h2>The CGC scale is the standard</h2>
        <p>
          Even if you never slab a book, the 10-point scale used by CGC and
          CBCS is the lingua franca. Learn it once and you&rsquo;ll read every
          marketplace listing, price guide, and pop report fluently:
        </p>
        <ul>
          <li>
            <strong>10.0 (Gem Mint)</strong> — vanishingly rare, essentially
            unattainable for any book that&rsquo;s been touched.
          </li>
          <li>
            <strong>9.8 (Near Mint/Mint)</strong> — the standard target for
            most modern collectors. Sharp corners, no spine ticks, glossy
            cover, white pages.
          </li>
          <li>
            <strong>9.6 (Near Mint+)</strong> — barely distinguishable from
            9.8 to the eye but a meaningful price drop on hot keys.
          </li>
          <li>
            <strong>9.4 (Near Mint)</strong> — minor handling, maybe a
            superficial spine tick. Most well-cared-for new books grade here.
          </li>
          <li>
            <strong>9.0 (Very Fine/Near Mint)</strong> — visible flaws but
            still &ldquo;clean.&rdquo;
          </li>
          <li>
            <strong>8.0 (Very Fine)</strong> — slightly rounded corners,
            light reading wear.
          </li>
          <li>
            <strong>6.0 (Fine)</strong> — clearly read but well-kept. Body
            of the cover still attractive.
          </li>
          <li>
            <strong>4.0 (Very Good)</strong> — significant wear, possibly a
            small color break or crease.
          </li>
          <li>
            <strong>2.0 (Good)</strong> — heavily worn but complete and
            structurally sound.
          </li>
          <li>
            <strong>0.5 (Poor)</strong> — barely a comic; missing pieces,
            tape, water damage.
          </li>
        </ul>

        <h2>What graders actually look at</h2>
        <p>Five categories, in roughly this order of impact:</p>
        <ol>
          <li>
            <strong>Spine.</strong> Ticks (small white stress lines), rolling
            (the spine bends rather than lying flat), and outright splits.
            Spine condition is the single most-weighted factor on most
            books.
          </li>
          <li>
            <strong>Corners.</strong> Sharpness vs. roundness. Even one blunt
            corner can drop a book from 9.8 to 9.4.
          </li>
          <li>
            <strong>Cover gloss and color.</strong> Has the ink dulled?
            Faded? Any color-breaking creases (a fold so deep you can see
            white paper through it)?
          </li>
          <li>
            <strong>Page quality.</strong> White, off-white, cream, tan,
            brown. Yellowing comes with age and storage; a 1962 book that
            has bright white pages is a rare and valuable thing.
          </li>
          <li>
            <strong>Defects.</strong> Tears, missing chunks, tape, writing,
            stains, bug damage, water damage. Any of these will cap your
            grade hard regardless of how nice the rest is.
          </li>
        </ol>

        <h2>The 5-minute self-grade</h2>
        <p>
          Here&rsquo;s the workflow we use, in order. Grab a soft, flat
          surface, a strong neutral light, and the book bagged or unbagged
          (your call):
        </p>
        <ol>
          <li>
            Hold the book under raking light at a shallow angle and rotate
            it. Surface defects you can&rsquo;t see straight-on jump out.
          </li>
          <li>
            Look at the spine first. Count ticks. A clean spine on a Bronze
            Age book is a 9.0+ candidate; one tick drops you toward 8.5.
          </li>
          <li>
            Check all four corners with a magnifier. Any blunting? Any
            color break?
          </li>
          <li>
            Open the book gently. Note the page color (white / off-white /
            cream / tan). Write it down — you&rsquo;ll forget.
          </li>
          <li>
            Flip through every page checking for tears, writing, brown
            spots, or missing pieces.
          </li>
          <li>
            Be honest. Most collectors over-grade their own books by a full
            point. If you&rsquo;re between two grades, pick the lower one and
            you&rsquo;ll never overpromise on a sale.
          </li>
        </ol>

        <h2>When to slab</h2>
        <p>
          Slabbing costs $20–$60 per book and takes weeks. The math only
          works for high-value keys (Bronze Age first appearances, hot
          modern variants, anything over ~$200 raw). For your everyday run
          books, an honest raw self-grade is better — you don&rsquo;t pay the
          slab fee, and the marketplace price for raw 9.0 vs. raw 9.4 is
          often within $10–$20.
        </p>

        <h2>Track it in your library</h2>
        <p>
          Once you&rsquo;ve graded a book, add it to your ComixCatalog
          collection with the grade recorded. Open the issue, click{" "}
          <strong>Edit grade</strong>, and use the numeric scale (or pick a
          condition label like VF or NM if you&rsquo;re estimating). The grade
          carries through to your insurance/appraisal PDF and any
          marketplace listing later.
        </p>
      </>
    ),
  },

  {
    slug: "comicvine-gcd-cgc-disagree",
    kicker: "Behind the Database",
    title: "When ComicVine, GCD, and CGC All Disagree — and Which to Trust",
    dek: "Three databases, three opinions on what counts as Volume 1. Here's how each one defines a series, where they get it wrong, and how ComixCatalog reconciles them.",
    publishedAt: "2026-04-26",
    readingTime: "5 min read",
    body: () => (
      <>
        <p>
          You&rsquo;d think there&rsquo;d be one universally agreed-on answer
          for &ldquo;What volume is Uncanny X-Men #500 from?&rdquo; You&rsquo;d
          be wrong. Three of the biggest comic databases — ComicVine, the
          Grand Comics Database, and CGC&rsquo;s registry — each define
          &ldquo;volume&rdquo; differently. For a collector trying to log a
          book accurately, this is the source of more headaches than any
          other.
        </p>

        <h2>Why three databases exist</h2>
        <ul>
          <li>
            <strong>The Grand Comics Database (GCD)</strong> is a community
            project, free and open, with the deepest historical coverage
            going back to Golden Age books. Strong on metadata (creators,
            indicia, story credits); weaker on cover imagery and modern
            pricing.
          </li>
          <li>
            <strong>ComicVine</strong> is a commercial database run by
            GameSpot. Best-in-class cover imagery, character pages, and
            modern coverage. Looser on indicia detail and renumbering edge
            cases.
          </li>
          <li>
            <strong>CGC&rsquo;s registry</strong> is built around what
            CGC&rsquo;s graders see when they slab a book. They define a
            volume by what&rsquo;s printed on the indicia of issue #1.
            Authoritative for slabbed-book identification.
          </li>
        </ul>

        <h2>Where they disagree</h2>
        <p>
          The classic example is renumbering. After Marvel ran{" "}
          <em>Amazing Spider-Man</em> from #1 (1963) to #441 (1999), they
          relaunched at #1, then went back to legacy numbering at #500
          (2003). Did the &ldquo;original Amazing Spider-Man&rdquo; series
          end at #441 or continue through #800? Each database picks a
          different answer.
        </p>
        <ul>
          <li>
            <strong>GCD</strong> tends to follow the indicia: if the book
            says &ldquo;Vol. 2 #1,&rdquo; it&rsquo;s a new volume. Strict
            and consistent, but creates more series entries than
            collectors usually think about.
          </li>
          <li>
            <strong>ComicVine</strong> often groups by editorial intent. If
            Marvel calls it the same series &ldquo;going back to legacy
            numbering,&rdquo; ComicVine tends to combine. Easier to browse,
            messier when you want to be precise.
          </li>
          <li>
            <strong>CGC</strong> is bound by what&rsquo;s on the slab label.
            A 1999 ASM #1 in a CGC slab is labeled &ldquo;V. 2&rdquo; — a
            2003 ASM #500 is labeled as part of the original run.
          </li>
        </ul>

        <h2>How ComixCatalog reconciles</h2>
        <p>
          ComixCatalog draws metadata from <strong>GCD</strong> as the
          source of truth — it&rsquo;s the most rigorous about indicia and
          renumbering. We pull cover imagery from <strong>ComicVine</strong>{" "}
          because the visuals are the best available. And when you record a
          slabbed book in your collection, we capture the{" "}
          <strong>CGC cert number</strong> so you can always link back to
          the authoritative grading record regardless of how anyone else
          chose to organize the series.
        </p>
        <p>
          The result: you log books the way they&rsquo;re actually printed
          (per GCD), see them with their correct cover (per ComicVine), and
          can verify any slabbed book&rsquo;s identity in seconds (per CGC
          registry).
        </p>

        <h2>What this means for you</h2>
        <p>
          When you search ComixCatalog for a series like &ldquo;Uncanny
          X-Men&rdquo; or &ldquo;Amazing Spider-Man,&rdquo; you may see
          multiple entries — one per volume per GCD&rsquo;s definition.
          That&rsquo;s the correct level of detail. Pick the one that
          matches the indicia of the book in your hand. If you&rsquo;re
          unsure, the year of publication is the fastest tiebreaker —
          Marvel&rsquo;s 1999 ASM Vol 2 has different cover art and a
          different price tag than 1963&rsquo;s Vol 1.
        </p>
        <p>
          And when you sell or insure: the GCD volume is what marketplace
          buyers expect to see, the ComicVine cover is what they&rsquo;ll
          recognize, and the CGC cert is what proves the grade. All three.
        </p>
      </>
    ),
  },

  {
    slug: "bronze-age-investments-overlooked",
    kicker: "Investing",
    title: "The Best Bronze Age Investments Most Collectors Overlook",
    dek: "Everyone knows about Hulk #181 and Giant-Size X-Men #1. Here's where the next decade of upside might actually live.",
    publishedAt: "2026-04-22",
    readingTime: "7 min read",
    body: () => (
      <>
        <p>
          The headline Bronze Age keys — <em>Incredible Hulk</em> #181 (first
          full Wolverine, 1974), <em>Giant-Size X-Men</em> #1 (1975),{" "}
          <em>Amazing Spider-Man</em> #129 (first Punisher, 1974) — have all
          had their explosive growth phases. They&rsquo;re still good books,
          but the price-to-upside ratio is no longer where it was in 2015.
          For collectors thinking long, the question now is: where&rsquo;s
          the <em>next</em> ASM #129?
        </p>
        <p>
          Here&rsquo;s a short list of Bronze Age books we think have
          asymmetric upside left in them. None are picks — they&rsquo;re
          patterns to study.
        </p>

        <h2>1. Star Wars #1 (Marvel, 1977)</h2>
        <p>
          The original Marvel <em>Star Wars</em> #1 has the Holy Trinity of
          collector signals: a beloved IP, real cultural significance (it
          subsidized Marvel through the late &lsquo;70s), and 35-cent price
          variants that are pop-report scarce. The 35-cent variant in 9.8
          has crept up steadily; the regular 30-cent in mid-grade is still
          cheap. Disney&rsquo;s ongoing investment in <em>Star Wars</em> as
          a franchise keeps the floor higher than people think.
        </p>

        <h2>2. Tomb of Dracula #10 (1973)</h2>
        <p>
          First appearance of Blade. He&rsquo;s had three movies and an
          MCU reboot is in motion. The book is from a horror title that
          collectors under-collected because horror was unfashionable in
          the &lsquo;80s and &lsquo;90s — but pop reports are way thinner
          than you&rsquo;d expect, and 9.4+ copies are still attainable in
          a way that contemporaries like Werewolf by Night #32 (first Moon
          Knight) are not.
        </p>

        <h2>3. Marvel Spotlight #5 (1972)</h2>
        <p>
          First appearance of the original Ghost Rider (Johnny Blaze).
          Marvel has tried twice to make Ghost Rider a movie franchise and
          will likely try again. The book is older than the more-famous
          Ghost Rider #1 (1973), it has a great Mike Ploog cover, and it
          remains shockingly attainable in 8.0–9.0.
        </p>

        <h2>4. Conan the Barbarian #1 (Marvel, 1970)</h2>
        <p>
          Bronze Age sword-and-sorcery is undervalued because it doesn&rsquo;t
          fit cleanly into the superhero narrative. <em>Conan</em> #1 is the
          founding book of an entire genre at Marvel, with Barry
          Windsor-Smith art that historians regard as some of the
          finest of the era. As Robert E. Howard&rsquo;s work moves into the
          public domain in pieces, IP attention will follow.
        </p>

        <h2>5. Werewolf by Night #1 (1972)</h2>
        <p>
          Marvel&rsquo;s 2022 Werewolf by Night Halloween special on Disney+
          was a critical hit and is reportedly being expanded. The first
          appearance of Jack Russell as Werewolf by Night was actually in
          Marvel Spotlight #2 — but #1 of his ongoing is still a Bronze Age
          first that doesn&rsquo;t carry the Spotlight #2 premium yet.
        </p>

        <h2>The pattern to watch</h2>
        <p>
          The strongest Bronze Age picks share three things:
        </p>
        <ol>
          <li>
            <strong>An underappreciated first.</strong> First appearances
            in non-flagship titles (Marvel Spotlight, Marvel Premiere,
            Marvel Team-Up) tend to lag behind first appearances in
            flagship books for years before catching up.
          </li>
          <li>
            <strong>Active live-action interest.</strong> A character who
            could plausibly headline a movie or limited series in the next
            five years sees its first appearance run.
          </li>
          <li>
            <strong>Pop-report scarcity.</strong> Books from titles that
            were considered &ldquo;throwaway&rdquo; in their era —
            horror, cosmic, sword-and-sorcery — were less likely to be
            preserved, so high-grade copies are rarer than the published
            print run suggests.
          </li>
        </ol>

        <p>
          None of this is investment advice. Comics are a genuinely
          interesting collectible because the floor is &ldquo;you own a
          piece of art history that&rsquo;s also an enjoyable thing to
          read.&rdquo; If you&rsquo;re just chasing growth charts, the
          stock market is more efficient. But if you love the books and
          want to be smart about which ones you spend your money on,
          paying attention to the patterns above won&rsquo;t hurt.
        </p>
      </>
    ),
  },
];

export default ARTICLES;

export function getArticle(slug) {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
