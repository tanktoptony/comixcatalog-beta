import { NextResponse } from "next/server";
import { searchSeriesRpc } from "@/lib/searchRpc";
import { parseSearchQuery, yearMatches, yearScore } from "@/lib/searchQuery";
import { diversify } from "@/lib/searchVariety";
import { pinCurrentRun } from "@/lib/searchCurrentRun";
import { getServiceClient } from "@/lib/supabase/service";
import { US_PUBLISHER_ALLOWLIST } from "@/lib/publisher";
import { CDN_CACHE_SHORT } from "@/lib/cdnCache";
import { normalizeSeriesSearchWords, searchWordCoverage } from "@/lib/seriesSearchMatch";
import { resolveSeriesCovers } from "@/lib/catalog/covers";
import { aliasTermsFor } from "@/lib/searchAliases";
import { unstable_cache } from "next/cache";
import { createServerTiming } from "@/lib/serverTiming";
import {
  DegradedSearchError,
  normalizeSearchCacheTerm,
  SEARCH_CACHE_REVALIDATE_SECONDS,
  sliceSearchResults,
} from "@/lib/searchCache";

function normalizeSearch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeForScoring(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function stripTrailingIssueNumber(q) {
  const trimmed = String(q ?? "").trim();
  const match = trimmed.match(/([\s#])(\d+(?:\.\d+)?)$/);
  if (!match) return trimmed;
  const num = Number(match[2]);
  if (Number.isInteger(num) && num >= 1900 && num <= 2099) {
    return trimmed;
  }
  return trimmed.slice(0, match.index).trim();
}

function normalizeTitleKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = String(row?.id ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

const SERIES_SELECT = `
  id,
  gcd_id,
  title,
  issue_count_cached,
  year_start_cached,
  year_end_cached,
  resolved_publisher_cached,
  us_market,
  featured_cover_path_cached
`;

// Found live 2026-08-28: series.title_normalized has no index at all, so
// every search did a full sequential scan of ~208k rows (measured: 1.1s
// for a single EXACT-match query). Worse, ordering by issue_count_cached
// DESC and truncating at a fixed limit happened BEFORE relevance was ever
// considered — real exact/near-exact matches like "The Amazing Spider-Man"
// (1983) and "Your Friendly Neighborhood Spider-Man" (2025) were silently
// dropped from a "spiderman" search because 200+ unrelated
// substring-containing one-shots outranked them by issue count first.
// See scripts/migrations/0023_series_search_relevance.sql and 0024's
// follow-up fix for the full incident writeup and the
// series search RPC this calls (now search_series_by_relevance_v2, 0064,
// via src/lib/searchRpc.js), which ranks by
// (exact match, starts-with, contains — each capped-length-penalized, not
// diluted by raw trigram similarity) before any limit is applied.
//
// result_limit=1000: verified live 2026-08-28 that real worst-case totals
// for busy franchise names top out around 687 (Batman) — 1000 covers that
// with margin. Also matches PostgREST's own default response cap (see
// CLAUDE.md's "PostgREST 1000-row cap is silent" note) — requesting more
// than 1000 would just get silently truncated by the platform regardless,
// so 1000 is the actual practical ceiling here, not an arbitrary choice.
//
// Falls back to the old ILIKE-and-hope query if the migration hasn't been
// run yet (function not found) or any other RPC error — never worse than
// the pre-fix behavior, just not yet fixed until the migration lands.
async function fetchSeriesCandidates(supabase, searchWords, normalizedQ) {
  let { data, error } = await searchSeriesRpc(supabase, {
    normalized_term: searchWords,
    allowed_publishers: US_PUBLISHER_ALLOWLIST,
    result_limit: 1000,
  });
  if (!error && (data?.length || searchWords === normalizedQ)) return data ?? [];

  // Before migration 0038 the RPC only understands compact terms. Retrying
  // keeps existing searches working during the deploy window. The spaced
  // first call is what unlocks word-order matching after 0038 is applied.
  if (searchWords !== normalizedQ) {
    const legacy = await searchSeriesRpc(supabase, {
      normalized_term: normalizedQ,
      allowed_publishers: US_PUBLISHER_ALLOWLIST,
      result_limit: 1000,
    });
    if (!legacy.error) return legacy.data ?? [];
    error ??= legacy.error;
  }

  console.error(
    "series search RPC (search_series_by_relevance_v2, migration 0064) failed, falling back to ILIKE search:",
    error.message
  );
  const { data: fallbackRows, error: fallbackError } = await supabase
    .from("series")
    .select(SERIES_SELECT)
    .ilike("title_normalized", `%${normalizedQ}%`)
    .not("gcd_id", "is", null)
    .gt("issue_count_cached", 0)
    .not("year_start_cached", "is", null)
    .or(`us_market.eq.true,resolved_publisher_cached.in.(${US_PUBLISHER_ALLOWLIST.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`)
    .order("issue_count_cached", { ascending: false })
    .limit(200);
  if (fallbackError) throw fallbackError;
  return fallbackRows ?? [];
}

// UUIDs per .in() in the volume lookup. 300 worked and 500 failed when
// measured; 200 leaves headroom for longer query strings.
const VOLUME_LOOKUP_CHUNK = 200;

async function computeSeriesResponse(req) {
  const timing = createServerTiming();
  for (const phase of ["candidates", "volume_ids", "ranking", "covers", "serialization"]) timing.set(phase);
  const json = (body, init) => {
    const response = timing.measureSync("serialization", () => NextResponse.json(body, init));
    response.headers.set("Server-Timing", timing.header());
    return response;
  };
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return json({ series: [] });

    // The header dropdown asks for more than the old fixed 12 now that it is
    // page-width. Capped so a scripted caller cannot ask for the catalog.
    const requested = Number(searchParams.get("limit"));
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(Math.trunc(requested), 40))
      : 12;
    // ranked=1 is set only by the internal cached computation below; GET
    // never forwards it, so an outside caller can't ask for the uncapped list.
    const returnFullRanking = searchParams.get("ranked") === "1";

    // A year in the query is a FILTER, not title text. It used to be left in,
    // so "rai 1994" normalized to "rai1994" and returned nothing at all while
    // "hulk 181" worked fine — a trailing issue number was stripped, a
    // trailing year deliberately was not, and then nobody used it.
    const parsed = parseSearchQuery(q);
    const askedYear = parsed.year;
    const strippedQuery = stripTrailingIssueNumber(parsed.title || q);
    const titleQuery = strippedQuery || parsed.title || q;
    const normalizedQ = normalizeSearch(titleQuery);
    const searchWords = normalizeSeriesSearchWords(titleQuery);
    const normalizedQForScoring = normalizeForScoring(titleQuery);

    if (!normalizedQ) return json({ series: [] });

    const supabase = getServiceClient();
    const aliasTerms = aliasTermsFor(normalizedQ);

    let rows;
    try {
      const aliasFetches = aliasTerms.map((term) =>
        fetchSeriesCandidates(supabase, term, term).catch((aliasError) => {
          console.error(`series search alias fetch failed for ${term}:`, aliasError);
          return [];
        })
      );
      const candidateSets = await timing.measure("candidates", () => Promise.all([
        fetchSeriesCandidates(supabase, searchWords, normalizedQ),
        ...aliasFetches,
      ]));
      rows = dedupeById(candidateSets.flat());
    } catch (fetchError) {
      console.error("GET /api/search/series failed:", fetchError);
      return json({ series: [], degraded: true });
    }

    // Found live 2026-08-28 spot-checking "Amazing Spider-Man" results: GCD
    // splits one real ComicVine volume into multiple gcd_series rows with
    // non-overlapping year ranges (confirmed: 9 fragment rows, 1-7 issues
    // each, scattered across 1974-2013, all pinned to the same
    // comicvine_volume_id as the real 441-issue 1963-1998 run). The
    // dedup fingerprint below only keys on (publisher, year range), so
    // fragments with distinct years never collapse and show up as if they
    // were separate volumes a collector would recognize. A shared,
    // non-null comicvine_volume_id is a much stronger "these are the same
    // real book" signal than year overlap — fetch it here and let it
    // override the year-based fingerprint below.
    const volumeIdByRowId = new Map();
    let searchDegraded = false;
    if (rows.length > 0) {
      // Chunked: a broad query ("batman") returns up to 1,000 rows, and 1,000
      // UUIDs in one .in() is a ~37 KB URL that the API rejects (400 above
      // ~400 ids, measured 2026-10-05). Before WS3c that error was ignored,
      // so volume grouping silently never ran for broad searches.
      const ids = rows.map((r) => r.id);
      const chunks = [];
      for (let i = 0; i < ids.length; i += VOLUME_LOOKUP_CHUNK) {
        chunks.push(ids.slice(i, i + VOLUME_LOOKUP_CHUNK));
      }
      const results = await timing.measure("volume_ids", () => Promise.all(
        chunks.map((chunk) =>
          supabase
            .from("series")
            .select("id, comicvine_volume_id")
            .in("id", chunk)
            .not("comicvine_volume_id", "is", null)
        )
      ));
      const volumeRowsError = results.find((r) => r.error)?.error ?? null;
      const volumeRows = results.flatMap((r) => r.data ?? []);
      // Volume ids only refine how same-titled rows group; without them the
      // year fingerprint below still groups correctly. Show results, flag it.
      if (volumeRowsError) {
        console.error("series search volume lookup failed:", volumeRowsError.code, volumeRowsError.message);
        searchDegraded = true;
      }
      for (const v of volumeRows ?? []) {
        volumeIdByRowId.set(v.id, v.comicvine_volume_id);
      }
    }

    const significanceTier = (count) => {
      if (count >= 50) return 3;
      if (count >= 15) return 2;
      if (count >= 3) return 1;
      return 0;
    };

    const compareSeries = (a, b) => {
      const aTitle = normalizeForScoring(a.title);
      const bTitle = normalizeForScoring(b.title);

      const aExact = aTitle === normalizedQForScoring ? 1 : 0;
      const bExact = bTitle === normalizedQForScoring ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;

      // More of the searched words in the title wins before cover state and
      // issue count. Single-word and squashed queries ("batman", "spiderman")
      // score every candidate the same, so they keep today's ordering.
      const aWords = searchWordCoverage(a.title, titleQuery);
      const bWords = searchWordCoverage(b.title, titleQuery);
      if (bWords !== aWords) return bWords - aWords;

      // When a year was asked for it is the most specific thing the searcher
      // said, so it outranks cover state and issue count. Exact start year
      // beats a run that merely spans the year. Ranking only — the filter
      // below is what actually removes the other volumes.
      if (askedYear != null) {
        const aYear = yearScore(a, askedYear);
        const bYear = yearScore(b, askedYear);
        if (bYear !== aYear) return bYear - aYear;
      }

      // Surface the volume that has a real (year-aware matched) cover first —
      // it's the canonical edition a collector recognizes. This only REORDERS
      // within a title cluster, never hides a volume. (Hiding uncovered rows
      // would suppress legit runs like the 2024 Dynamite ThunderCats, since
      // only ~2.5% of series carry a cached cover.) For marquee titles where
      // every volume is covered, this is a no-op and issue-count ordering wins.
      // Among equally good title matches, the run GCD reprints most is the
      // one collectors mean: "x-men" finds the 1963 run (5,296 reprints)
      // before the 2001 one (186), though 2001 has more issues. 0 until the
      // 0066 backfill runs, which leaves today's order unchanged.
      const aReprints = Number(a.reprint_count) || 0;
      const bReprints = Number(b.reprint_count) || 0;
      if (bReprints !== aReprints) return bReprints - aReprints;

      const aTier = significanceTier(a.issue_count_cached ?? 0);
      const bTier = significanceTier(b.issue_count_cached ?? 0);
      if (bTier !== aTier) return bTier - aTier;

      const aStarts = aTitle.startsWith(normalizedQForScoring) ? 1 : 0;
      const bStarts = bTitle.startsWith(normalizedQForScoring) ? 1 : 0;
      if (bStarts !== aStarts) return bStarts - aStarts;

      if ((b.issue_count_cached ?? 0) !== (a.issue_count_cached ?? 0)) {
        return (b.issue_count_cached ?? 0) - (a.issue_count_cached ?? 0);
      }

      return (a.title ?? "").localeCompare(b.title ?? "");
    };

    const stopRanking = timing.start("ranking");
    const grouped = new Map();
    for (const row of rows ?? []) {
      const key = normalizeTitleKey(row.title);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const volumeIndexById = new Map();
    const volumeCountById = new Map();

    const cleaned = [];
    for (const group of grouped.values()) {
      const sorted = [...group].sort(compareSeries);
      const kept = [];
      const fingerprints = new Set();

      const seenVolumeIds = new Set();
      for (const row of sorted) {
        // Strongest signal first: same comicvine_volume_id = same real book,
        // no matter what publisher/year GCD's fragment happens to carry.
        // `sorted` is already ranked best-first (compareSeries), so the
        // first row for a given volume wins and later fragments are
        // dropped as duplicates.
        const volumeId = volumeIdByRowId.get(row.id);
        if (volumeId != null) {
          if (seenVolumeIds.has(volumeId)) continue;
          seenVolumeIds.add(volumeId);
          kept.push(row);
          continue;
        }

        const pub = String(row.resolved_publisher_cached ?? "").toLowerCase();
        const yearStart = row.year_start_cached ?? "";
        const yearEnd = row.year_end_cached ?? "";
        const issueCount = row.issue_count_cached ?? 0;
        // Primary fingerprint: same publisher + same years = same canonical series
        const yearKey = yearStart || yearEnd ? `${pub}|${yearStart}-${yearEnd}` : null;
        // Fallback when year data is missing: bucket issue counts by rough magnitude
        // so an 857-issue row and a 284-issue row stay separate, but two 128-issue
        // rows from the same publisher collapse.
        const countBucket = Math.round(issueCount / 5);
        const countKey = `${pub}#${countBucket}`;

        const fp = yearKey ?? countKey;
        if (fingerprints.has(fp)) continue;
        fingerprints.add(fp);
        kept.push(row);
      }

      // Drop tiny runs if a much bigger one exists in the same title group
      const best = kept[0];
      const pruned = kept.filter((row, idx) => {
        if (idx === 0) return true;
        if ((row.issue_count_cached ?? 0) < 3 && (best.issue_count_cached ?? 0) >= 15) {
          return false;
        }
        return true;
      });

      // Assign volume indicators only when every row in the group has a real
      // year_start AND the starts are distinct. Without reliable chronology
      // the numbers would be meaningless — better to show nothing than to lie.
      if (pruned.length > 1) {
        const allHaveYears = pruned.every((r) => Number.isFinite(r.year_start_cached));
        const starts = pruned.map((r) => r.year_start_cached);
        const startsAreDistinct = new Set(starts).size === starts.length;

        if (allHaveYears && startsAreDistinct) {
          const ordered = [...pruned].sort(
            (a, b) => a.year_start_cached - b.year_start_cached
          );
          ordered.forEach((row, i) => {
            volumeIndexById.set(row.id, i + 1);
            volumeCountById.set(row.id, ordered.length);
          });
        }
      }

      cleaned.push(...pruned);
    }

    cleaned.sort(compareSeries);

    // Apply the year the searcher asked for, but never make the result set
    // worse than it would have been without it. If the filter empties the
    // list — our year data is wrong, or GCD disagrees with the cover date by
    // more than a year — fall back to the unfiltered ranking, which is still
    // year-boosted by compareSeries above. Turning "some results, badly
    // ordered" into "zero results" is the bug this whole change exists to
    // fix; reintroducing it through the fix would be worse than not shipping.
    let ranked = cleaned;
    if (askedYear != null) {
      const inYear = cleaned.filter((row) => yearMatches(row, askedYear));
      if (inYear.length > 0) ranked = inYear;
    } else {
      ranked = pinCurrentRun(ranked, (row) => normalizeForScoring(row.title) === normalizedQForScoring);
    }

    // Spread the page across distinct runs instead of letting one title
    // fill it. Live before this, every one of the twelve results for
    // "spider-man" was a series titled exactly "Spider-Man", and Detective
    // Comics — 887 issues — was absent from "batman" entirely.
    //
    // An explicit year means the searcher already named the volume, so
    // variety would fight them: "rai 1994" wants Rai (1994), not one of
    // each Rai-ish title.
    const deduped = dedupeById(ranked);
    const top = returnFullRanking
      ? deduped
      : askedYear != null
        ? deduped.slice(0, limit)
        : diversify(deduped, { limit, perTitle: 2 });

    // The card is derived from this series' resolved issues, never from the
    // independently refreshed featured_cover_path_cached value.
    stopRanking();
    const resolvedSeriesCovers = returnFullRanking
      ? new Map()
      : await timing.measure("covers", () => resolveSeriesCovers(supabase, top));
    const series = top.map((row) => ({
      id: row.id,
      gcd_id: row.gcd_id ?? null,
      title: row.title ?? "Untitled Series",
      issue_count: row.issue_count_cached ?? 0,
      year_start: row.year_start_cached ?? null,
      year_end: row.year_end_cached ?? null,
      volume_index: volumeIndexById.get(row.id) ?? null,
      volume_count: volumeCountById.get(row.id) ?? null,
      publisher: {
        name: row.resolved_publisher_cached ?? "Unknown Publisher",
      },
      cover: (() => {
        const path = resolvedSeriesCovers.get(row.id)?.storage_path;
        return path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`
          : null;
      })(),
    }));

    // A degraded result must not sit in the CDN for ten minutes.
    if (searchDegraded) return json({ series, degraded: true });
    return json({ series }, { headers: CDN_CACHE_SHORT });
  } catch (err) {
    console.error("GET /api/search/series crashed:", err);
    return json({ series: [], degraded: true });
  }
}

const cachedSeriesSearch = unstable_cache(
  async (normalizedTerm, askedYear) => {
    const query = askedYear == null ? normalizedTerm : `${normalizedTerm} ${askedYear}`;
    const response = await computeSeriesResponse(
      new Request(`http://internal/api/search/series?q=${encodeURIComponent(query)}&ranked=1`)
    );
    const serverTiming = response.headers.get("Server-Timing") || "";
    const result = await response.json();
    const measured = { ...result, _serverTiming: serverTiming };
    if (result.degraded) throw new DegradedSearchError(measured);
    return measured;
  },
  ["search-series-v1"],
  { revalidate: SEARCH_CACHE_REVALIDATE_SECONDS, tags: ["search"] }
);

export async function getCachedSeriesSearch(q, { limit = 12 } = {}) {
  const parsed = parseSearchQuery(q);
  const title = stripTrailingIssueNumber(parsed.title || q) || parsed.title || q;
  const normalizedTerm = normalizeSearchCacheTerm(title);
  try {
    const result = await cachedSeriesSearch(normalizedTerm, parsed.year ?? null);
    const selected = parsed.year != null
      ? sliceSearchResults(result.series, { limit })
      : diversify(result.series, { limit, perTitle: 2 });
    const covers = await resolveSeriesCovers(getServiceClient(), selected.map((row) => ({
      id: row.id,
      gcd_id: row.gcd_id,
      title: row.title,
      year_start_cached: row.year_start,
      year_end_cached: row.year_end,
      resolved_publisher_cached: row.publisher?.name,
    })));
    const series = selected.map((row) => {
      const path = covers.get(row.id)?.storage_path;
      return {
        ...row,
        cover: path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`
          : null,
      };
    });
    return { ...result, series };
  } catch (error) {
    if (error instanceof DegradedSearchError) {
      const selected = parsed.year != null
        ? sliceSearchResults(error.result.series, { limit })
        : diversify(error.result.series, { limit, perTitle: 2 });
      const covers = await resolveSeriesCovers(getServiceClient(), selected.map((row) => ({
        id: row.id,
        gcd_id: row.gcd_id,
        title: row.title,
        year_start_cached: row.year_start,
        year_end_cached: row.year_end,
        resolved_publisher_cached: row.publisher?.name,
      })));
      return {
        ...error.result,
        series: selected.map((row) => {
          const path = covers.get(row.id)?.storage_path;
          return {
            ...row,
            cover: path
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`
              : null,
          };
        }),
      };
    }
    throw error;
  }
}

export async function GET(req) {
  const timing = createServerTiming();
  timing.set("search_cache");
  timing.set("serialization");
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const requested = Number(searchParams.get("limit"));
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 40)) : 12;
    if (!q) return NextResponse.json({ series: [] }, { headers: { "Server-Timing": timing.header() } });
    const result = await timing.measure("search_cache", () => getCachedSeriesSearch(q, { limit }));
    const { _serverTiming, ...body } = result;
    const headers = result.degraded ? undefined : CDN_CACHE_SHORT;
    const response = timing.measureSync("serialization", () => NextResponse.json(body, { headers }));
    response.headers.set("Server-Timing", [_serverTiming, timing.header()].filter(Boolean).join(", "));
    return response;
  } catch (err) {
    console.error("GET /api/search/series crashed:", err);
    const response = NextResponse.json({ series: [], degraded: true });
    response.headers.set("Server-Timing", timing.header());
    return response;
  }
}
