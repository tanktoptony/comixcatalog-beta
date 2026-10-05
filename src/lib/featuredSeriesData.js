import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { FEATURED_SERIES } from "@/lib/featuredSeries";
import { baseIssueNumber } from "@/lib/coverMatch";
import { fetchAllPages } from "./supabase/fetchAllPages.js";

// The homepage "Featured series" carousel and the no-query /search browse
// list. Moved out of GET /api/comics (2026-10-01) so the homepage can render
// it on the server instead of fetching it after load.
//
// Computing it is slow (~5-7 s: it pages through every issue and cover of
// ~100 series to check full coverage) and the answer only changes weekly
// (rotation) or when covers land, so it is cached for an hour in Next's data
// cache, shared across all requests and regions. A failed computation
// throws, so an error is never cached as an empty carousel.
//
// Version history of the selection rules lives with the route
// (src/app/api/comics/route.js).

// Weekly rotation seed: ISO-week index since epoch. Same value for all
// requests within one calendar week → carousel looks identical to a user
// reloading the page on Monday afternoon and Friday morning, but flips to a
// new mix the following Monday. Adds liveliness without cron infra.
function currentWeekIndex() {
  const now = Date.now();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  return Math.floor(now / oneWeekMs);
}

// Deterministic shuffle: same `seed` → same output order. Mulberry32 over
// a hashed seed. Tier ordering is preserved by shuffling *within* each tier
// rather than across the whole list — Tier 1 (current heat) always leads.
function seededShuffle(arr, seed) {
  // Mulberry32 PRNG — small, decent distribution, deterministic.
  let s = (seed | 0) || 1;
  const rand = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rotateFeaturedSeries(week) {
  // Bucket by tier (default 5 for entries missing the field), shuffle each
  // bucket with a tier-offset seed so different tiers get different orderings,
  // then concatenate tier1 → tier2 → tier3 → tier4.
  const byTier = new Map();
  for (const entry of FEATURED_SERIES) {
    const tier = entry.tier ?? 5;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(entry);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const out = [];
  for (const tier of tiers) {
    out.push(...seededShuffle(byTier.get(tier), week * 1000 + tier));
  }
  return out;
}

async function computeFeaturedSeries(weekIndex) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const rotatedFeatured = rotateFeaturedSeries(weekIndex);

  // Pull every series row matching any (title, publisher) pair from the
  // curated list. We can't compose a clean IN clause for tuples in
  // PostgREST, so we batch by distinct titles instead — the publisher
  // filter happens in JS below.
  const distinctTitles = [...new Set(rotatedFeatured.map((e) => e.title))];

  const { data: candidates, error } = await supabase
    .from("series")
    .select(
      "id, gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached, issue_count_cached, featured_cover_path_cached"
    )
    .in("title", distinctTitles)
    .not("featured_cover_path_cached", "is", null);
  if (error) throw error;

  // Bucket candidates by (title, publisher) for fast lookup. Same title can
  // exist under different publishers (Batman / DC, Batman / Ediciones).
  const byTitlePub = new Map();
  for (const row of candidates ?? []) {
    const key = `${row.title.toLowerCase()}::${(row.resolved_publisher_cached ?? "").toLowerCase()}`;
    if (!byTitlePub.has(key)) byTitlePub.set(key, []);
    byTitlePub.get(key).push(row);
  }

  // For each rotated entry, find the best matching series row.
  // prefer_year is the tiebreaker when multiple volumes share the title +
  // publisher (Amazing Spider-Man 1963 vs 1999 vs 2022).
  const resolved = [];
  for (const entry of rotatedFeatured) {
    const key = `${entry.title.toLowerCase()}::${entry.publisher.toLowerCase()}`;
    const pool = byTitlePub.get(key) ?? [];
    if (pool.length === 0) continue; // no match in DB, or no cover — silently drop

    // GCD sometimes carries multiple series entries under the identical
    // title (foreign licensed editions, stalled/incomplete duplicate
    // indexer entries) that all resolve to the same normalized publisher
    // string — e.g. "Ultimate Spider-Man" has a German Panini edition and
    // a 2-issue stub sitting alongside the real 19-issue Marvel US run,
    // all three tagged "Marvel Comics". When prefer_year ties between
    // rows, Postgres row order is NOT guaranteed without an ORDER BY, so
    // picking pool[0] flips between requests — different page loads were
    // showing different (sometimes the wrong, incomplete) series. Break
    // ties deterministically by issue_count_cached: the fullest series is
    // almost always the real, actively-tracked one, not a stub/foreign dupe.
    let best = pool[0];
    let bestYearDelta = Infinity;
    let bestIssueCount = -1;
    for (const row of pool) {
      const ys = row.year_start_cached;
      const yearDelta = entry.prefer_year != null && ys != null ? Math.abs(ys - entry.prefer_year) : Infinity;
      const issueCount = row.issue_count_cached ?? 0;
      const isBetter =
        yearDelta < bestYearDelta || (yearDelta === bestYearDelta && issueCount > bestIssueCount);
      if (isBetter) {
        best = row;
        bestYearDelta = yearDelta;
        bestIssueCount = issueCount;
      }
    }

    resolved.push({ entry, row: best });
  }

  // Full-coverage gate: a featured pick with visible cover gaps once you
  // click in looks worse than not featuring it. Drop any entry that isn't
  // 100% covered — every real (variant-deduped) issue number has a
  // canonical cover — rather than judging by the single hero image alone.
  const gcdIds = [...new Set(resolved.map(({ row }) => row.gcd_id).filter((v) => v != null))];

  const issuesByGcdId = new Map();
  const coveredByGcdId = new Map();
  if (gcdIds.length > 0) {
    const [issueRows, coverRows] = await Promise.all([
      fetchAllPages(() =>
        supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number").in("series_gcd_id", gcdIds).order("series_gcd_id").order("gcd_id"),
        "gcd_id"
      ),
      fetchAllPages(() =>
        supabase
          .from("canonical_covers")
          .select("series_gcd_id, issue_number")
          .in("series_gcd_id", gcdIds)
          .not("storage_path", "is", null)
          .order("id")
      ),
    ]);

    for (const row of issueRows) {
      const key = row.series_gcd_id;
      const base = baseIssueNumber(row.issue_number);
      if (base == null) continue;
      if (!issuesByGcdId.has(key)) issuesByGcdId.set(key, new Set());
      issuesByGcdId.get(key).add(base);
    }
    for (const row of coverRows) {
      const key = row.series_gcd_id;
      const base = baseIssueNumber(row.issue_number);
      if (base == null) continue;
      if (!coveredByGcdId.has(key)) coveredByGcdId.set(key, new Set());
      coveredByGcdId.get(key).add(base);
    }
  }

  const fullyCovered = resolved.filter(({ row }) => {
    if (row.gcd_id == null) return false; // can't verify completeness — don't feature it
    const issues = issuesByGcdId.get(row.gcd_id);
    if (!issues || issues.size === 0) return false;
    const covered = coveredByGcdId.get(row.gcd_id);
    if (!covered) return false;
    for (const issueNum of issues) {
      if (!covered.has(issueNum)) return false;
    }
    return true;
  });

  // The natural order is FEATURED_SERIES order (which encodes tier 1 → 4),
  // so callers only ever slice this.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return fullyCovered.map(({ row }) => ({
    id: `series-${row.id}`,
    series_id: row.id,
    series_title: row.title ?? "Untitled",
    publisher: row.resolved_publisher_cached ?? "Unknown Publisher",
    issue_number: null,
    release_year: row.year_start_cached ?? null,
    issue_count: row.issue_count_cached ?? 0,
    cover_path: row.featured_cover_path_cached
      ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${row.featured_cover_path_cached}`
      : null,
    created_by: null,
    __source: "series",
  }));
}

// The week index is an argument, so it is part of the cache key: Monday's
// rotation is a new entry, not an hour-old copy of last week's.
const cachedFeaturedSeries = unstable_cache(computeFeaturedSeries, ["featured-series-v1"], {
  revalidate: 3600,
});

// Every fully-covered featured series, in display order.
export function getFeaturedSeries() {
  return cachedFeaturedSeries(currentWeekIndex());
}
