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

    const { data: rows, error } = await supabase
      .from("series")
      .select(`
        id,
        gcd_id,
        title,
        issue_count_cached,
        year_start_cached,
        year_end_cached,
        resolved_publisher_cached,
        featured_cover_path_cached
      `)
      .ilike("title_normalized", `%${normalizedQ}%`)
      .not("gcd_id", "is", null)
      .gt("issue_count_cached", 0)
      // Quality gate: require a real year. Publisher attribution is unreliable
      // (cv_publisher was mass-stamped by the cover ingest's title-only match,
      // and gcd_series.publisher_gcd_id is scrambled), so we can't filter
      // foreign/garbage by publisher. But undated rows are overwhelmingly
      // foreign reprints, fragments, and junk — while every marquee series a
      // user actually searches is dated. Dropping null-year rows removes most
      // of the cruft (e.g. the 3 undated foreign "Thundercats" fragments) with
      // near-zero false positives on real books.
      .not("year_start_cached", "is", null)
      .in("resolved_publisher_cached", US_PUBLISHER_ALLOWLIST)
      .order("issue_count_cached", { ascending: false })
      .limit(60);

    if (error) {
      console.error("GET /api/search/series failed:", error);
      return NextResponse.json({ series: [] });
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

      for (const row of sorted) {
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

      // ID path query
      if (missingGcdIds.length > 0) {
        const { data: idRows } = await supabase
          .from("canonical_covers")
          .select("series_gcd_id, storage_path, series_year, cover_date")
          .in("series_gcd_id", missingGcdIds)
          .not("storage_path", "is", null)
          .limit(missingGcdIds.length * 20);
        for (const c of idRows ?? []) {
          if (!c.storage_path) continue;
          if (!byIdKey.has(c.series_gcd_id)) byIdKey.set(c.series_gcd_id, []);
          byIdKey.get(c.series_gcd_id).push(c);
        }
      }

      // Title path query
      if (missingTitles.length > 0) {
        const { data: titleRows } = await supabase
          .from("canonical_covers")
          .select("series_title, storage_path, series_year, cover_date, publisher")
          .in("series_title", missingTitles)
          .not("storage_path", "is", null)
          .limit(missingTitles.length * 20);
        for (const c of titleRows ?? []) {
          if (!c.storage_path) continue;
          const k = String(c.series_title ?? "").toLowerCase();
          if (!byTitleKey.has(k)) byTitleKey.set(k, []);
          byTitleKey.get(k).push(c);
        }
      }

      const yearOf = (c) => {
        const cd = c.cover_date ? Number(String(c.cover_date).slice(0, 4)) : null;
        if (cd && !Number.isNaN(cd)) return cd;
        return c.series_year != null ? Number(c.series_year) : null;
      };
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
        return (best ?? candidates[0]).storage_path;
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
