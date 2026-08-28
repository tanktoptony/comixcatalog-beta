import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "@/lib/publisher";

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
// search_series_by_relevance() function this calls, which ranks by
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
async function fetchSeriesCandidates(supabase, normalizedQ) {
  const { data, error } = await supabase.rpc("search_series_by_relevance", {
    normalized_term: normalizedQ,
    allowed_publishers: US_PUBLISHER_ALLOWLIST,
    result_limit: 1000,
  });
  if (!error) return data ?? [];

  console.error(
    "search_series_by_relevance RPC unavailable, falling back to ILIKE search — " +
      "run scripts/migrations/0023_series_search_relevance.sql to fix this:",
    error.message
  );
  const { data: fallbackRows, error: fallbackError } = await supabase
    .from("series")
    .select(SERIES_SELECT)
    .ilike("title_normalized", `%${normalizedQ}%`)
    .not("gcd_id", "is", null)
    .gt("issue_count_cached", 0)
    .not("year_start_cached", "is", null)
    .in("resolved_publisher_cached", US_PUBLISHER_ALLOWLIST)
    .order("issue_count_cached", { ascending: false })
    .limit(200);
  if (fallbackError) throw fallbackError;
  return fallbackRows ?? [];
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json({ series: [] });

    const strippedQuery = stripTrailingIssueNumber(q);
    const titleQuery = strippedQuery || q;
    const normalizedQ = normalizeSearch(titleQuery);
    const normalizedQForScoring = normalizeForScoring(titleQuery);

    if (!normalizedQ) return NextResponse.json({ series: [] });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let rows;
    try {
      rows = await fetchSeriesCandidates(supabase, normalizedQ);
    } catch (fetchError) {
      console.error("GET /api/search/series failed:", fetchError);
      return NextResponse.json({ series: [] });
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
      const { data: volumeRows } = await supabase
        .from("series")
        .select("id, comicvine_volume_id")
        .in("id", rows.map((r) => r.id))
        .not("comicvine_volume_id", "is", null);
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

      // Surface the volume that has a real (year-aware matched) cover first —
      // it's the canonical edition a collector recognizes. This only REORDERS
      // within a title cluster, never hides a volume. (Hiding uncovered rows
      // would suppress legit runs like the 2024 Dynamite ThunderCats, since
      // only ~2.5% of series carry a cached cover.) For marquee titles where
      // every volume is covered, this is a no-op and issue-count ordering wins.
      const aCover = a.featured_cover_path_cached ? 1 : 0;
      const bCover = b.featured_cover_path_cached ? 1 : 0;
      if (bCover !== aCover) return bCover - aCover;

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
    const top = dedupeById(cleaned).slice(0, 12);

    // Cover fallback for rows where featured_cover_path_cached is null.
    //
    // Two-path with year disambiguation. The old approach (title-string only,
    // pick first hit) caused G.I. Joe ARAH's 5 volumes to share one cover
    // because they share a title. Now:
    //   1. ID path — match series.gcd_id == canonical_covers.series_gcd_id
    //      (set by migration 0009 backfill). Volume-exact.
    //   2. Title path — when ID path comes up empty, fall back to title-match
    //      AND pick the canonical whose series_year is closest to the
    //      series row's year_start_cached. Stops cross-volume bleed.
    const missingCover = top.filter((row) => !row.featured_cover_path_cached);
    const fallbackPathById = new Map();
    if (missingCover.length > 0) {
      const missingGcdIds = [
        ...new Set(missingCover.map((r) => r.gcd_id).filter(Boolean)),
      ];
      const missingTitles = [
        ...new Set(missingCover.map((r) => r.title).filter(Boolean)),
      ];

      const byIdKey = new Map();   // gcd_id -> [{path, series_year, cover_date}]
      const byTitleKey = new Map(); // titleLower -> [{path, series_year, cover_date, publisher}]

      // ID path and title path are independent of each other — run them
      // concurrently instead of back-to-back (was two sequential awaits;
      // this was one of several serial round trips found while chasing the
      // "slow, staggered" search complaint 2026-08-28 — see 0023's comment
      // for the bigger fix, this is the cheap complementary one).
      const [idQuery, titleQuery] = await Promise.all([
        missingGcdIds.length > 0
          ? supabase
              .from("canonical_covers")
              .select("series_gcd_id, storage_path, series_year, cover_date")
              .in("series_gcd_id", missingGcdIds)
              .not("storage_path", "is", null)
              .limit(missingGcdIds.length * 20)
          : Promise.resolve({ data: [] }),
        missingTitles.length > 0
          ? supabase
              .from("canonical_covers")
              .select("series_title, storage_path, series_year, cover_date, publisher")
              .in("series_title", missingTitles)
              .not("storage_path", "is", null)
              .limit(missingTitles.length * 20)
          : Promise.resolve({ data: [] }),
      ]);

      for (const c of idQuery.data ?? []) {
        if (!c.storage_path) continue;
        if (!byIdKey.has(c.series_gcd_id)) byIdKey.set(c.series_gcd_id, []);
        byIdKey.get(c.series_gcd_id).push(c);
      }
      for (const c of titleQuery.data ?? []) {
        if (!c.storage_path) continue;
        const k = String(c.series_title ?? "").toLowerCase();
        if (!byTitleKey.has(k)) byTitleKey.set(k, []);
        byTitleKey.get(k).push(c);
      }

      const yearOf = (c) => {
        const cd = c.cover_date ? Number(String(c.cover_date).slice(0, 4)) : null;
        if (cd && !Number.isNaN(cd)) return cd;
        return c.series_year != null ? Number(c.series_year) : null;
      };
      // Year-bounded closest match. Without an upper bound, a single
      // canonical_cover from one Venom volume gets falsely assigned to all
      // 11 Venom volumes in search results because it's the "closest" of one.
      // Tolerance=5yrs is generous enough to handle late-issue covers
      // (Venom 2003 vol ran through 2004 issues), strict enough to avoid
      // a 14yr cross-volume bleed. When the only candidate is too far off,
      // return null and let the styled empty-card placeholder show instead.
      const MAX_YEAR_DELTA = 5;
      const pickClosest = (candidates, targetYear) => {
        if (!candidates || candidates.length === 0) return null;
        if (targetYear == null) return candidates[0].storage_path;
        let best = null;
        let bestDiff = Infinity;
        for (const c of candidates) {
          const cy = yearOf(c);
          if (cy == null) continue;
          const diff = Math.abs(cy - targetYear);
          if (diff < bestDiff) { best = c; bestDiff = diff; }
        }
        if (best && bestDiff <= MAX_YEAR_DELTA) return best.storage_path;
        return null;
      };

      for (const row of missingCover) {
        // ID path first.
        const idCandidates = row.gcd_id ? byIdKey.get(row.gcd_id) : null;
        let path = pickClosest(idCandidates, row.year_start_cached);
        if (!path) {
          // Title path — narrow to publisher-matching candidates first if any.
          const titleCandidates = byTitleKey.get(String(row.title ?? "").toLowerCase()) ?? [];
          const pubKey = String(row.resolved_publisher_cached ?? "").toLowerCase();
          const pubFiltered = pubKey
            ? titleCandidates.filter((c) => String(c.publisher ?? "").toLowerCase() === pubKey)
            : [];
          path = pickClosest(pubFiltered.length ? pubFiltered : titleCandidates, row.year_start_cached);
        }
        if (path) fallbackPathById.set(row.id, path);
      }
    }

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
        const path = row.featured_cover_path_cached ?? fallbackPathById.get(row.id);
        return path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`
          : null;
      })(),
    }));

    return NextResponse.json({ series });
  } catch (err) {
    console.error("GET /api/search/series crashed:", err);
    return NextResponse.json({ series: [] });
  }
}
