// Content selection for the "brand" post family in instagramBot.js — posts
// about ComixCatalog itself (feature highlights, catalog stats, blog-post
// spotlights) rather than a specific comic. Three sub-types rotate the same
// way the comic pickers do: try today's leader first, fall through the
// others if it has nothing eligible.
//
// Each picker returns { dedupeKey, kicker, headline, subtext, accent,
// captionBody } or null. captionBody is the longer-form text for the
// Instagram caption (the card image itself only has room for the short
// headline/subtext).
//
// Topic collision guard — added 2026-08-28 after a real incident: the
// hardcoded "217,000+ series, one search" feature-highlight below (a
// hand-written figure from ~May 2026) and a live "By the Numbers: 207,000+
// series" stats card posted two days later, both about the series count,
// with two different, contradicting numbers (the live series count had
// actually dropped to ~208k from duplicate-series cleanup work in the
// meantime). To a viewer scrolling the feed that reads as the same post
// repeated. Fix: (1) the series-count feature highlight is now computed
// live instead of hardcoded, so it can't drift from the stats card's own
// number; (2) every brand sub-picker tags its pick with a `topic`, and
// pickBrandPost() won't return a pick whose topic was used in the last
// TOPIC_LOOKBACK brand posts, even across sub-pickers.

const ACCENTS = { stats: "gold", feature: "red", blog: "gold" };
const TOPIC_LOOKBACK = 5;

// Curated, hand-written — mirrors the pattern of src/lib/featuredSeries.js
// (a maintained list, not auto-generated). Only features that have actually
// shipped; do not add anything from the roadmap. Keep each under ~100 chars
// so it fits the card at the large headline size.
//
// `topic` is null for features that don't restate a live number (no
// collision risk). Entries that DO restate one must set `topic` to the
// matching STAT_QUERIES key (see pickCatalogStats) so the lookback guard
// can catch the overlap, and should compute the number live rather than
// hardcoding it — see `dynamicSeriesCount` below for the pattern.
const FEATURE_HIGHLIGHTS = [
  {
    headline: "Newsstand vs. direct edition",
    subtext: "Same issue, different edition — and often a different value. ComixCatalog tracks the distinction, not just the issue number.",
    topic: null,
  },
  {
    headline: "CGC & CBCS cert lookup",
    subtext: "Log your slab's cert number and it links straight to the live grading-company registry. No separate app for that.",
    topic: null,
  },
  {
    headline: "Auto market value from real sold comps",
    subtext: "Your library shows an estimated value pulled from actual recent sales, not a guess — with the sample size shown so you can judge confidence.",
    topic: null,
  },
  {
    // Was a hardcoded "217,000+ series, one search" — see the incident note
    // above for why that went stale and collided with the stats card.
    dynamicSeriesCount: true,
    topic: "series-count",
    subtextTemplate:
      "Grand Comics Database metadata with ComicVine cover art layered on top — the full history of the medium, searchable in one place.",
  },
  {
    headline: "Want lists that actually help",
    subtext: "Track what you're missing from a run, not just what you own. Casual collectors filling gaps, not just serious collectors cataloguing everything.",
    topic: null,
  },
  {
    headline: "Insurance-ready collection reports",
    subtext: "Export a PDF with cover art, grades, and current market values — built for appraisals and estate planning, not just bragging rights.",
    topic: null,
  },
];

function normalizeCount(n) {
  // Round DOWN to a clean, honest lower-bound the way the homepage proof
  // strip does ("217,000+") — never round up past what's actually true.
  if (n >= 1_000_000) return `${Math.floor(n / 100_000) / 10}M+`;
  if (n >= 1000) return `${Math.floor(n / 1000) * 1000}+`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return String(n);
}

// Extracts the topic tag from a brand dedupeKey so pickBrandPost() can
// compare topics across sub-pickers, not just exact-string dedupe keys.
// Both formats embed it as the segment right after "stats:"/"feature:"
// ("none" for feature entries with no collision risk, e.g.
// "brand:feature:none:CGC & CBCS cert lookup").
function extractTopic(dedupeKey) {
  const match = /^brand:(?:stats|feature):([a-z0-9-]+):/.exec(dedupeKey);
  if (!match || match[1] === "none") return null;
  return match[1];
}

// Looks at the last TOPIC_LOOKBACK entries actually posted (ledger order —
// see loadLedger()'s note on Set preserving JSON array insertion order) and
// returns the set of topics among them, so a fresh pick can be skipped if
// it would restate the same subject as a recent post.
function recentBrandTopics(seenKeys, lookback = TOPIC_LOOKBACK) {
  const ordered = [...seenKeys];
  const topics = new Set();
  for (const key of ordered.slice(-lookback)) {
    const topic = extractTopic(key);
    if (topic) topics.add(topic);
  }
  return topics;
}

async function pickCatalogStats(supabase, seenKeys, recentTopics, dayIndex) {
  const STAT_QUERIES = [
    {
      key: "series-count",
      label: "series",
      run: () => supabase.from("series").select("*", { count: "exact", head: true }),
    },
    {
      key: "cover-count",
      label: "cover scans archived",
      run: () =>
        supabase
          .from("canonical_covers")
          .select("*", { count: "exact", head: true })
          .not("storage_path", "is", null),
    },
    {
      key: "gcd-issue-count",
      label: "issues indexed",
      run: () => supabase.from("gcd_issues").select("*", { count: "exact", head: true }),
    },
  ];

  const order = [...STAT_QUERIES.slice(dayIndex % STAT_QUERIES.length), ...STAT_QUERIES.slice(0, dayIndex % STAT_QUERIES.length)];
  for (const stat of order) {
    if (recentTopics.has(stat.key)) continue;
    const { count, error } = await stat.run();
    if (error || count == null) continue;
    const formatted = normalizeCount(count);
    const dedupeKey = `brand:stats:${stat.key}:${formatted}`;
    if (seenKeys.has(dedupeKey)) continue;
    return {
      dedupeKey,
      kicker: "By the Numbers",
      headline: `${formatted} ${stat.label}`,
      subtext: "Cataloged and searchable right now. Track your own collection against all of it.",
      accent: ACCENTS.stats,
      // Must NOT restate the headline. buildBrandCaption emits headline, a
      // blank line, then this — so opening with "${formatted} ${stat.label}"
      // again printed the same sentence twice in a row, live, on 2026-09-22.
      captionBody: `It grows every night while I sleep, which is the only kind of growth I trust.`,
    };
  }
  return null;
}

async function pickFeatureHighlight(supabase, seenKeys, recentTopics, dayIndex) {
  const order = [...FEATURE_HIGHLIGHTS.slice(dayIndex % FEATURE_HIGHLIGHTS.length), ...FEATURE_HIGHLIGHTS.slice(0, dayIndex % FEATURE_HIGHLIGHTS.length)];
  for (const feature of order) {
    if (feature.topic && recentTopics.has(feature.topic)) continue;

    let headline = feature.headline;
    let subtext = feature.subtext;
    if (feature.dynamicSeriesCount) {
      const { count, error } = await supabase.from("series").select("*", { count: "exact", head: true });
      if (error || count == null) continue;
      headline = `${normalizeCount(count)} series, one search`;
      subtext = feature.subtextTemplate;
    }

    const dedupeKey = `brand:feature:${feature.topic || "none"}:${headline}`;
    if (seenKeys.has(dedupeKey)) continue;
    return {
      dedupeKey,
      kicker: "Feature Spotlight",
      headline,
      subtext,
      accent: ACCENTS.feature,
      captionBody: subtext,
    };
  }
  return null;
}

// Takes seenKeys itself rather than letting the caller filter the result.
//
// It used to return unconditionally on the first iteration of this loop and
// leave the seenKeys check to pickBrandPost. That made the loop decorative:
// only the single newest post was ever offered, so once it had been posted
// the whole blog sub-picker returned null on every subsequent run and no
// older post was ever spotlighted again. Found 2026-09-22 while adding the
// two new posts — the how-to post would have taken the slot once and then
// blocked "Getting back into comics" from ever getting one.
//
// Newest-first order is still the intent; the loop now actually walks past
// posts that have already had their turn.
async function pickBlogSpotlight(supabase, seenKeys) {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(10);
  if (error || !data?.length) return null;

  for (const post of data) {
    const dedupeKey = `brand:blog:${post.slug}`;
    if (seenKeys.has(dedupeKey)) continue;
    return {
      dedupeKey,
      kicker: "From the Blog",
      headline: post.title,
      subtext: post.excerpt || "New on the ComixCatalog blog.",
      accent: ACCENTS.blog,
      captionBody: post.excerpt || "",
      slug: post.slug,
    };
  }
  return null;
}

// dayIndex: same Math.floor(Date.now()/86400000) the comic pickers use, so
// rotation stays deterministic and previewable.
export async function pickBrandPost(supabase, seenKeys, dayIndex = Math.floor(Date.now() / 86400000)) {
  const recentTopics = recentBrandTopics(seenKeys);
  // Only blog spotlights, as of 2026-09-24.
  //
  // Measured over the account's whole history, average likes by post family:
  //
  //   (hand-written, no template)   16.9
  //   Cover Spotlight                7.7
  //   New to the Catalog             6.8
  //   From the Blog                  6.0
  //   By the Numbers                 3.5
  //   Feature Spotlight              3.4
  //
  // The audience follows a comics account and ignores product marketing at
  // roughly half the rate it engages with a cover. "By the Numbers" and
  // "Feature Spotlight" are the two worst families on the account and three
  // of the five worst individual posts ever published.
  //
  // pickCatalogStats and pickFeatureHighlight are kept rather than deleted:
  // the card rendering and copy are fine, the placement was wrong, and a
  // stats card may earn its slot again on a bigger account. Putting either
  // back is one line here.
  const subPickers = [
    () => pickBlogSpotlight(supabase, seenKeys),
  ];
  const start = dayIndex % subPickers.length;
  const order = [...subPickers.slice(start), ...subPickers.slice(0, start)];
  for (const pick of order) {
    const post = await pick();
    if (post) return post;
  }
  return null;
}
