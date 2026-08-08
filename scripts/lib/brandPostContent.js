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

const ACCENTS = { stats: "gold", feature: "red", blog: "gold" };

// Curated, hand-written — mirrors the pattern of src/lib/featuredSeries.js
// (a maintained list, not auto-generated). Only features that have actually
// shipped; do not add anything from the roadmap. Keep each under ~100 chars
// so it fits the card at the large headline size.
const FEATURE_HIGHLIGHTS = [
  {
    headline: "Newsstand vs. direct edition",
    subtext: "Same issue, different edition — and often a different value. ComixCatalog tracks the distinction, not just the issue number.",
  },
  {
    headline: "CGC & CBCS cert lookup",
    subtext: "Log your slab's cert number and it links straight to the live grading-company registry. No separate app for that.",
  },
  {
    headline: "Auto market value from real sold comps",
    subtext: "Your library shows an estimated value pulled from actual recent sales, not a guess — with the sample size shown so you can judge confidence.",
  },
  {
    headline: "217,000+ series, one search",
    subtext: "Grand Comics Database metadata with ComicVine cover art layered on top — the full history of the medium, searchable in one place.",
  },
  {
    headline: "Want lists that actually help",
    subtext: "Track what you're missing from a run, not just what you own. Casual collectors filling gaps, not just serious collectors cataloguing everything.",
  },
  {
    headline: "Insurance-ready collection reports",
    subtext: "Export a PDF with cover art, grades, and current market values — built for appraisals and estate planning, not just bragging rights.",
  },
];

function normalizeCount(n) {
  // Round DOWN to a clean, honest lower-bound the way the homepage proof
  // strip does ("217,000+") — never round up past what's actually true.
  if (n >= 1_000_000) return `${Math.floor(n / 100_000) / 10}M+`;
  if (n >= 1000) return `${Math.floor(n / 1000) * 1000}+`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return String(n);
}

async function pickCatalogStats(supabase, seenKeys, dayIndex) {
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
      captionBody: `${formatted} ${stat.label} on ComixCatalog — the database is the moat, and it keeps growing.`,
    };
  }
  return null;
}

async function pickFeatureHighlight(seenKeys, dayIndex) {
  const order = [...FEATURE_HIGHLIGHTS.slice(dayIndex % FEATURE_HIGHLIGHTS.length), ...FEATURE_HIGHLIGHTS.slice(0, dayIndex % FEATURE_HIGHLIGHTS.length)];
  for (const feature of order) {
    const dedupeKey = `brand:feature:${feature.headline}`;
    if (seenKeys.has(dedupeKey)) continue;
    return {
      dedupeKey,
      kicker: "Feature Spotlight",
      headline: feature.headline,
      subtext: feature.subtext,
      accent: ACCENTS.feature,
      captionBody: feature.subtext,
    };
  }
  return null;
}

async function pickBlogSpotlight(supabase) {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(10);
  if (error || !data?.length) return null;

  for (const post of data) {
    const dedupeKey = `brand:blog:${post.slug}`;
    // Caller filters seenKeys — blog spotlight always tries the most recent
    // unposted entry first since freshness matters more here than for
    // stats/features.
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
  const subPickers = [
    () => pickCatalogStats(supabase, seenKeys, dayIndex),
    () => pickFeatureHighlight(seenKeys, dayIndex),
    async () => {
      const post = await pickBlogSpotlight(supabase);
      return post && !seenKeys.has(post.dedupeKey) ? post : null;
    },
  ];
  const start = dayIndex % subPickers.length;
  const order = [...subPickers.slice(start), ...subPickers.slice(0, start)];
  for (const pick of order) {
    const post = await pick();
    if (post) return post;
  }
  return null;
}
