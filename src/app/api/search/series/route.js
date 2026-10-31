import { after, NextResponse } from "next/server";
import { searchSeriesRpc } from "@/lib/searchRpc";
import { parseSearchQuery, yearMatches, yearScore } from "@/lib/searchQuery";
import { diversify, matchesSeriesFormat } from "@/lib/searchVariety";
import { pinCurrentRun } from "@/lib/searchCurrentRun";
import { getServiceClient } from "@/lib/supabase/service";
import { US_PUBLISHER_ALLOWLIST } from "@/lib/publisher";
import { CDN_CACHE_SHORT } from "@/lib/cdnCache";
import { normalizeSeriesSearchWords, searchWordCoverage } from "@/lib/seriesSearchMatch";
import { resolveSeriesCardCovers } from "@/lib/catalog/seriesCardCovers";
import { aliasTermsFor } from "@/lib/searchAliases";
import { unstable_cache } from "next/cache";
import { createServerTiming } from "@/lib/serverTiming";
import { cachedSearchTerm } from "@/lib/searchTermCache";
import { formatTag, formatTagTitle, isCollectedEdition } from "@/lib/seriesFormat";
import { foldWorks, summarizeEditions } from "@/lib/searchWorks";
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
// onFallback: the ILIKE path is a different (smaller, unranked) candidate set,
// reached today mostly when the RPC times out under load. Callers mark the
// result degraded so it is shown but never cached (search_term_cache, CDN).
async function fetchSeriesCandidates(supabase, searchWords, normalizedQ, onFallback = () => {}) {
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
  onFallback();
  const { data: fallbackRows, error: fallbackError } = await supabase
    .from("series")
    .select(SERIES_SELECT)
    .ilike("title_normalized", `%${normalizedQ}%`)
    .not("gcd_id", "is", null)
    .gt("issue_count_cached", 0)
    .not("year_start_cached", "is", null)
    .or(`us_market.eq.true,and(us_market.is.null,resolved_publisher_cached.in.(${US_PUBLISHER_ALLOWLIST.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")}))`)
    .order("issue_count_cached", { ascending: false })
    .limit(200);
  if (fallbackError) throw fallbackError;
  return fallbackRows ?? [];
}

// UUIDs per .in() in the volume lookup. 300 worked and 500 failed when
// measured; 200 leaves headroom for longer query strings.
const VOLUME_LOOKUP_CHUNK = 200;
const WORK_LOOKUP_CHUNK = 300;

async function loadSeriesFormats(supabase, rows, onError = () => {}) {
  const gcdIds = [...new Set(rows.map((row) => Number(row.gcd_id)).filter(Number.isFinite))];
  if (!gcdIds.length) return new Map();
  const chunks = [];
  for (let i = 0; i < gcdIds.length; i += VOLUME_LOOKUP_CHUNK) chunks.push(gcdIds.slice(i, i + VOLUME_LOOKUP_CHUNK));
  const results = await Promise.all(chunks.map((chunk) => supabase.from("gcd_series")
    .select("gcd_id, publishing_format, binding, publication_type, publisher_gcd_id")
    .in("gcd_id", chunk)));
  const error = results.find((result) => result.error)?.error;
  if (error) {
    console.error("series search format lookup failed:", error.code, error.message);
    onError();
    return new Map();
  }
  return new Map(results.flatMap((result) => result.data ?? []).map((row) => [Number(row.gcd_id), row]));
}

function addFormatTags(rows, formats) {
  return rows.map((row) => {
    const format = formats.get(Number(row.gcd_id));
    const input = { name: row.title, ...format };
    return {
      ...row,
      format_tag: formatTag(input),
      format_tag_title: formatTagTitle(input),
      format_collected: isCollectedEdition(input) || /graphic novel/i.test(String(input.publishing_format ?? "")),
      publisher_gcd_id: format?.publisher_gcd_id ?? row.publisher_gcd_id ?? null,
    };
  });
}

function chunksOf(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

async function addWorkSummaries(supabase, rows) {
  const resultGcdIds = [...new Set(rows.map((row) => Number(row.gcd_id)).filter(Number.isFinite))];
  if (!resultGcdIds.length) return rows;
  const resultChunks = chunksOf(resultGcdIds, WORK_LOOKUP_CHUNK);
  const linkResults = await Promise.all([
    ...resultChunks.map((chunk) => supabase
      .from("series_editions")
      .select("edition_gcd_id, work_gcd_id, role")
      .in("edition_gcd_id", chunk)),
    ...resultChunks.map((chunk) => supabase
      .from("series_editions")
      .select("edition_gcd_id, work_gcd_id, role")
      .in("work_gcd_id", chunk)),
  ]);
  const linkError = linkResults.find((result) => result.error)?.error;
  if (linkError) throw linkError;

  const links = [...new Map(linkResults
    .flatMap((result) => result.data ?? [])
    .map((link) => [Number(link.edition_gcd_id), link])).values()];
  const resultGcdIdSet = new Set(resultGcdIds);
  const workGcdIds = new Set(links
    .map((link) => Number(link.work_gcd_id))
    .filter((gcdId) => resultGcdIdSet.has(gcdId)));
  const editionGcdIds = [...new Set(links
    .filter((link) => workGcdIds.has(Number(link.work_gcd_id)))
    .map((link) => Number(link.edition_gcd_id)))];
  const editionResults = await Promise.all(chunksOf(editionGcdIds, WORK_LOOKUP_CHUNK).map((chunk) => supabase
    .from("series")
    .select("id, gcd_id, title, issue_count_cached, card_cover_path")
    .in("gcd_id", chunk)));
  const editionError = editionResults.find((result) => result.error)?.error;
  if (editionError) throw editionError;

  const editionRows = editionResults.flatMap((result) => result.data ?? []);
  let formatError = null;
  const editionFormats = await loadSeriesFormats(supabase, editionRows, (error) => { formatError = error ?? true; });
  if (formatError) throw new Error("series edition format lookup failed");
  const linkByEdition = new Map(links.map((link) => [Number(link.edition_gcd_id), link]));
  const editionsByWork = new Map();
  for (const edition of editionRows) {
    const link = linkByEdition.get(Number(edition.gcd_id));
    if (!link) continue;
    const workGcdId = Number(link.work_gcd_id);
    if (!editionsByWork.has(workGcdId)) editionsByWork.set(workGcdId, []);
    editionsByWork.get(workGcdId).push({
      id: edition.id,
      gcd_id: edition.gcd_id,
      title: edition.title,
      issue_count: edition.issue_count_cached,
      card_cover_path: edition.card_cover_path,
      role: link.role,
      format: editionFormats.get(Number(edition.gcd_id)),
    });
  }

  return rows.map((row) => {
    const link = linkByEdition.get(Number(row.gcd_id));
    const editions = editionsByWork.get(Number(row.gcd_id));
    return {
      ...row,
      ...(link ? { work_gcd_id: Number(link.work_gcd_id) } : {}),
      ...(editions?.length ? { editions: summarizeEditions({ work: row, editions }) } : {}),
    };
  });
}

async function computeSeriesResponse(req) {
  const timing = createServerTiming();
  for (const phase of ["candidates", "volume_ids", "ranking", "covers", "works", "serialization"]) timing.set(phase);
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
    let searchDegraded = false;
    let formatLookupFailed = false;
    const markDegraded = () => { searchDegraded = true; };
    try {
      const aliasFetches = aliasTerms.map((term) =>
        fetchSeriesCandidates(supabase, term, term, markDegraded).catch((aliasError) => {
          console.error(`series search alias fetch failed for ${term}:`, aliasError);
          return [];
        })
      );
      const candidateSets = await timing.measure("candidates", () => Promise.all([
        fetchSeriesCandidates(supabase, searchWords, normalizedQ, markDegraded),
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
      // 0075 backfill runs, which leaves today's order unchanged.
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
    const allSeriesFormats = returnFullRanking
      ? await loadSeriesFormats(supabase, rows, () => {
        formatLookupFailed = true;
        markDegraded();
      })
      : new Map();
    const grouped = new Map();
    for (const row of rows ?? []) {
      const key = normalizeTitleKey(row.title);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const volumeIndexById = new Map();
    const volumeCountById = new Map();

    // A trade is never a duplicate of the monthly it collects. The Wicked +
    // The Divine TPB (Image, 2014-2019) has the monthly's exact publisher and
    // years, and the dedupe below folded it away, so it was unfindable even
    // as "wicked divine tpb" (2026-10-29). Formats only load for the cached
    // ranking; elsewhere every row is "".
    const editionKey = (row) => {
      const format = allSeriesFormats.get(Number(row.gcd_id));
      const input = { name: row.title, ...format };
      return isCollectedEdition(input) || /graphic novel/i.test(String(format?.publishing_format ?? ""))
        ? `${formatTag(input)}:`
        : "";
    };

    const cleaned = [];
    for (const group of grouped.values()) {
      const sorted = [...group].sort(compareSeries);
      const kept = [];
      const fingerprints = new Set();

      const seenVolumeIds = new Set();
      for (const row of sorted) {
        const edition = editionKey(row);
        // Strongest signal first: same comicvine_volume_id = same real book,
        // no matter what publisher/year GCD's fragment happens to carry.
        // `sorted` is already ranked best-first (compareSeries), so the
        // first row for a given volume wins and later fragments are
        // dropped as duplicates.
        const volumeId = volumeIdByRowId.get(row.id);
        if (volumeId != null) {
          const volumeKey = `${edition}${volumeId}`;
          if (seenVolumeIds.has(volumeKey)) continue;
          seenVolumeIds.add(volumeKey);
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

        const fp = edition + (yearKey ?? countKey);
        if (fingerprints.has(fp)) continue;
        fingerprints.add(fp);
        kept.push(row);
      }

      // Drop tiny runs if a much bigger one exists in the same title group
      const best = kept[0];
      const pruned = kept.filter((row, idx) => {
        if (idx === 0 || editionKey(row)) return true;
        if ((row.issue_count_cached ?? 0) < 3 && (best.issue_count_cached ?? 0) >= 15) {
          return false;
        }
        return true;
      });

      if (returnFullRanking && !formatLookupFailed) {
        const exactTitle = normalizeForScoring(pruned[0]?.title) === normalizedQForScoring;
        const eligible = (row) => {
          const format = allSeriesFormats.get(Number(row.gcd_id));
          const input = { name: row.title, ...format };
          return !isCollectedEdition(input)
            && !/graphic novel|one-shot|giveaway/i.test(String(input.publishing_format ?? ""));
        };
        const anchor = exactTitle ? pruned.find(eligible) : null;
        const publisherId = anchor
          ? allSeriesFormats.get(Number(anchor.gcd_id))?.publisher_gcd_id
          : null;
        const volumeRuns = publisherId == null ? [] : pruned.filter((row) => (
          exactTitle
          && allSeriesFormats.get(Number(row.gcd_id))?.publisher_gcd_id === publisherId
          && eligible(row)
        ));
        if (volumeRuns.length > 1 && volumeRuns.every((row) => Number.isFinite(row.year_start_cached))) {
          volumeRuns.toSorted((a, b) => a.year_start_cached - b.year_start_cached || Number(a.gcd_id) - Number(b.gcd_id))
            .forEach((row, i) => {
              volumeIndexById.set(row.id, i + 1);
              volumeCountById.set(row.id, volumeRuns.length);
            });
        }
      } else if (pruned.length > 1) {
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
      // A 2026 Batman HC is not the current Batman run.
      ranked = pinCurrentRun(ranked, (row) => normalizeForScoring(row.title) === normalizedQForScoring && !editionKey(row));
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

    // The card is derived from this series' resolved issues (stored per series
    // by resolveSeriesCardCovers), never from the independently refreshed
    // featured_cover_path_cached value.
    stopRanking();
    const [resolvedSeriesCovers, seriesFormats] = returnFullRanking
      ? [new Map(), allSeriesFormats]
      : await Promise.all([
        timing.measure("covers", () => resolveSeriesCardCovers(supabase, top)),
        loadSeriesFormats(supabase, top),
      ]);
    let series = addFormatTags(top.map((row) => ({
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
      cover: coverUrl(resolvedSeriesCovers.get(row.id)?.storage_path),
    })), seriesFormats);
    if (returnFullRanking) {
      try {
        series = await timing.measure("works", () => addWorkSummaries(supabase, series));
      } catch (workError) {
        console.error("series search work lookup failed:", workError.code, workError.message);
        markDegraded();
      }
    }

    // A degraded result must not sit in the CDN for ten minutes.
    if (searchDegraded) return json({ series, degraded: true });
    return json({ series }, { headers: CDN_CACHE_SHORT });
  } catch (err) {
    console.error("GET /api/search/series crashed:", err);
    return json({ series: [], degraded: true });
  }
}

// The full ranked list for one term (no covers). Stored per term in
// search_term_cache; a degraded result is returned but never stored.
async function computeSeriesTerm(normalizedTerm, askedYear) {
  const query = askedYear == null ? normalizedTerm : `${normalizedTerm} ${askedYear}`;
  const response = await computeSeriesResponse(
    new Request(`http://internal/api/search/series?q=${encodeURIComponent(query)}&ranked=1`)
  );
  const serverTiming = response.headers.get("Server-Timing") || "";
  const result = await response.json();
  return { ...result, _serverTiming: serverTiming };
}

// Only used when search_term_cache can't be read (migration 0068 missing).
const legacyCachedSeriesSearch = unstable_cache(
  async (normalizedTerm, askedYear) => {
    const measured = await computeSeriesTerm(normalizedTerm, askedYear);
    if (measured.degraded) throw new DegradedSearchError(measured);
    return measured;
  },
  ["search-series-v5"],
  { revalidate: SEARCH_CACHE_REVALIDATE_SECONDS, tags: ["search"] }
);

function coverUrl(path) {
  return path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`
    : null;
}

// Covers are picked for the returned page only, outside the term cache, from
// the per-series stored pick (see src/lib/catalog/seriesCardCovers.js).
// runs: every run titled exactly what was searched, then the usual variety.
// The results page uses it for its end-of-list "full runs" links, where
// Superman (1987) matters even though the shelf keeps two Supermans.
function exactRunsFirst(rows, title, limit) {
  const wanted = normalizeForScoring(title);
  const exact = rows.filter((row) => normalizeForScoring(row.title) === wanted).slice(0, limit);
  const rest = rows.filter((row) => !exact.includes(row));
  return [...exact, ...diversify(rest, { limit: limit - exact.length, perTitle: 2 })].slice(0, limit);
}

async function withCardCovers(result, parsed, limit, timing, runsTitle = null, works = false) {
  const cachedRows = result.series ?? [];
  const allRows = works && !parsed.format ? foldWorks(cachedRows) : cachedRows;
  const matchingFormat = parsed.format
    ? allRows.filter((row) => matchesSeriesFormat(row, parsed.format))
    : allRows;
  const filtered = matchingFormat.length > 0 ? matchingFormat : allRows;
  const volumeMatch = parsed.volume == null
    ? null
    : filtered.find((row) => row.volume_index === parsed.volume);
  const ordered = volumeMatch
    ? [volumeMatch, ...filtered.filter((row) => row !== volumeMatch)]
    : filtered;
  const selected = parsed.year != null
    ? sliceSearchResults(ordered, { limit })
    : runsTitle
      ? exactRunsFirst(ordered, runsTitle, limit)
      : diversify(ordered, { limit, perTitle: 2 });
  const resolve = () => resolveSeriesCardCovers(getServiceClient(), selected.map((row) => ({
    id: row.id,
    gcd_id: row.gcd_id,
    title: row.title,
    year_start_cached: row.year_start,
    year_end_cached: row.year_end,
    resolved_publisher_cached: row.publisher?.name,
  })));
  const covers = await (timing ? timing.measure("card_covers", resolve) : resolve());
  const wanted = normalizeForScoring(parsed.title);
  const exactCount = allRows.filter((row) => normalizeForScoring(row.title) === wanted).length;
  return {
    ...result,
    series: selected.map((row) => ({
      ...row,
      cover: coverUrl(covers.get(row.id)?.storage_path),
      ...(row.editions ? {
        editions: {
          ...row.editions,
          groups: row.editions.groups.map(({ cover_path: coverPath, ...group }) => ({
            ...group,
            cover: coverUrl(coverPath),
          })),
        },
      } : {}),
    })),
    title_runs: exactCount > 1 ? { title: parsed.title, count: exactCount } : null,
  };
}

export async function getCachedSeriesSearch(q, { limit = 12, timing = null, runs = false, works = false } = {}) {
  const parsed = parseSearchQuery(q);
  const title = stripTrailingIssueNumber(parsed.title || q) || parsed.title || q;
  const normalizedTerm = normalizeSearchCacheTerm(title);
  const askedYear = parsed.year ?? null;
  const { result, state } = await cachedSearchTerm(getServiceClient(), {
    kind: "series",
    key: `v5|${askedYear == null ? normalizedTerm : `${normalizedTerm}|${askedYear}`}`,
    compute: () => computeSeriesTerm(normalizedTerm, askedYear),
    schedule: after,
    fallback: () => legacyCachedSeriesSearch(normalizedTerm, askedYear).catch((error) => {
      if (error instanceof DegradedSearchError) return error.result;
      throw error;
    }),
  });
  return { ...(await withCardCovers(result, parsed, limit, timing, runs ? title : null, works)), _cacheState: state };
}

export async function GET(req) {
  const timing = createServerTiming();
  timing.set("search_cache");
  timing.set("card_covers");
  timing.set("serialization");
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const requested = Number(searchParams.get("limit"));
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 40)) : 12;
    if (!q) return NextResponse.json({ series: [] }, { headers: { "Server-Timing": timing.header() } });
    const runs = searchParams.get("runs") === "1";
    const works = searchParams.get("works") === "1";
    const result = await timing.measure("search_cache", () => getCachedSeriesSearch(q, { limit, timing, runs, works }));
    const { _serverTiming, _cacheState, ...body } = result;
    const headers = result.degraded ? undefined : CDN_CACHE_SHORT;
    const response = timing.measureSync("serialization", () => NextResponse.json(body, { headers }));
    response.headers.set("X-Search-Cache", _cacheState);
    response.headers.set("Server-Timing", [_serverTiming, timing.header()].filter(Boolean).join(", "));
    return response;
  } catch (err) {
    console.error("GET /api/search/series crashed:", err);
    const response = NextResponse.json({ series: [], degraded: true });
    response.headers.set("Server-Timing", timing.header());
    return response;
  }
}
