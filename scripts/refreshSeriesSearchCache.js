// Populates the cached search columns on `series`:
//   issue_count_cached, year_start_cached, year_end_cached,
//   resolved_publisher_cached, featured_cover_path_cached, search_refreshed_at
//
// Processes rows where search_refreshed_at IS NULL in batches until done.
// To force a full rebuild:
//   UPDATE series SET search_refreshed_at = NULL;
// then rerun this script.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { resolvePublisher } from "../src/lib/publisher.js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 100;
const FORCE = process.argv.includes("--force");

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function isPlaceholderIssueNumber(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return true;
  return s === "[nn]" || s === "nn" || s === "(nn)";
}

// In --force mode we walk the table by id cursor instead of filtering on
// search_refreshed_at, so the script can chew through everything without
// needing the giant UPDATE … SET search_refreshed_at = NULL to commit first.
// Tradeoff: id-ordered batches don't cluster volumes of the same title, so
// cross-volume cover claims only work within a single batch's title group
// (less effective than the normal mode's title-ordered batching).
let forceCursorId = null;

async function fetchSeriesBatch() {
  let query = supabase
    .from("series")
    .select(`
      id,
      gcd_id,
      title,
      cv_publisher,
      publisher:publisher_id (
        name,
        gcd_id
      )
    `)
    .not("gcd_id", "is", null);

  if (FORCE) {
    if (forceCursorId != null) {
      query = query.gt("id", forceCursorId);
    }
    query = query.order("id", { ascending: true });
  } else {
    query = query.is("search_refreshed_at", null).order("title", { ascending: true });
  }

  const { data, error } = await query.limit(BATCH_SIZE);

  if (error) throw error;
  const rows = data ?? [];

  if (FORCE && rows.length > 0) {
    forceCursorId = rows[rows.length - 1].id;
  }

  return rows;
}

function normalizePublisherForMatch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+comics?$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

async function processBatch(seriesBatch) {
  if (seriesBatch.length === 0) return 0;

  const seriesGcdIds = seriesBatch.map((s) => s.gcd_id);
  const seriesTitles = [
    ...new Set(seriesBatch.map((s) => s.title).filter(Boolean)),
  ];

  const issueRows = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data: page, error: issueErr } = await supabase
      .from("gcd_issues")
      .select("series_gcd_id, publisher_gcd_id, issue_number, publication_date")
      .in("series_gcd_id", seriesGcdIds)
      .order("gcd_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (issueErr) throw issueErr;
    if (!page || page.length === 0) break;
    issueRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const publisherGcdIds = [
    ...new Set(
      (issueRows ?? [])
        .map((r) => r.publisher_gcd_id)
        .filter(Boolean)
        .map(String)
    ),
  ];

  const pubNameByGcdId = {};
  if (publisherGcdIds.length > 0) {
    const { data: pubRows, error: pubErr } = await supabase
      .from("gcd_publishers")
      .select("gcd_id, name")
      .in("gcd_id", publisherGcdIds);

    if (pubErr) throw pubErr;

    for (const row of pubRows ?? []) {
      pubNameByGcdId[String(row.gcd_id)] = row.name;
    }
  }

  const issuesBySeriesGcdId = new Map();
  for (const row of issueRows ?? []) {
    const key = String(row.series_gcd_id);
    if (!issuesBySeriesGcdId.has(key)) issuesBySeriesGcdId.set(key, []);
    issuesBySeriesGcdId.get(key).push(row);
  }

  // Fetch canonical_covers for all titles in this batch. We deliberately do NOT
  // filter on issue_number at SQL level — with 100 series × ~50 issues, the URL
  // grows past undici's ~16KB header cap and the request fails with
  // UND_ERR_HEADERS_OVERFLOW. The per-issue matching happens in JS below using
  // coversByTitleAndIssue, so the matching quality is identical.
  let coverRows = [];
  if (seriesTitles.length > 0) {
    const { data, error } = await supabase
      .from("canonical_covers")
      .select("series_title, storage_path, publisher, cover_date, issue_number, series_year")
      .in("series_title", seriesTitles);

    if (error) throw error;
    coverRows = data ?? [];
  }

  // Index covers by (lowercased title, issue_number) so each series can pull
  // exactly the candidate covers that correspond to its own issue numbers.
  const coversByTitleKey = new Map();
  const coversByTitleAndIssue = new Map();
  for (const row of coverRows) {
    const titleKey = String(row.series_title ?? "").trim().toLowerCase();
    if (!titleKey) continue;
    if (!coversByTitleKey.has(titleKey)) coversByTitleKey.set(titleKey, []);
    coversByTitleKey.get(titleKey).push(row);

    const issueKey = `${titleKey}::${String(row.issue_number ?? "").trim()}`;
    if (!coversByTitleAndIssue.has(issueKey)) coversByTitleAndIssue.set(issueKey, []);
    coversByTitleAndIssue.get(issueKey).push(row);
  }

  // Phase 1: compute per-series metadata (issueCount, years, resolvedPublisher).
  // Covers are NOT picked here because we need cross-volume assignment.
  const computed = seriesBatch.map((series) => {
    const issuesForSeries = issuesBySeriesGcdId.get(String(series.gcd_id)) ?? [];

    const issueCount = issuesForSeries.filter(
      (r) => !isPlaceholderIssueNumber(r.issue_number)
    ).length;

    const years = issuesForSeries
      .map((r) => parseYear(r.publication_date))
      .filter((y) => y != null);

    const yearStart = years.length ? Math.min(...years) : null;
    const yearEnd = years.length ? Math.max(...years) : null;

    const issuePublisherNames = [
      ...new Set(
        issuesForSeries
          .map((r) => r.publisher_gcd_id)
          .filter(Boolean)
          .map((id) => pubNameByGcdId[String(id)])
          .filter(Boolean)
      ),
    ];

    const titleKey = String(series.title ?? "").trim().toLowerCase();

    // Per-issue cover matching: for each issue this series has, look up only
    // canonical_covers whose (series_title, issue_number) actually match.
    // Prefer covers whose series_year matches the issue's publication year.
    const seriesIssueNums = new Set(
      issuesForSeries.map((r) => String(r.issue_number ?? "").trim()).filter(Boolean)
    );

    const issueYearByNumber = new Map();
    for (const r of issuesForSeries) {
      const num = String(r.issue_number ?? "").trim();
      if (!num) continue;
      const y = parseYear(r.publication_date);
      if (y != null) issueYearByNumber.set(num, y);
    }

    const coverCandidates = [];
    for (const num of seriesIssueNums) {
      const pool = coversByTitleAndIssue.get(`${titleKey}::${num}`) ?? [];
      if (pool.length === 0) continue;

      const issueYear = issueYearByNumber.get(num);
      const yearMatched = issueYear != null
        ? pool.filter((row) => Number(row.series_year) === issueYear)
        : [];

      // If we have a year-matched cover, that's almost certainly the right one.
      // Otherwise take all candidates for this issue and let the scorer sort it out.
      const chosenPool = yearMatched.length > 0 ? yearMatched : pool;
      for (const row of chosenPool) {
        coverCandidates.push({ ...row, _issueYear: issueYear ?? null });
      }
    }

    // Fall back to title-only matches if per-issue lookup found nothing —
    // preserves the previous (weaker) behavior rather than regressing.
    const fallbackPool = coverCandidates.length === 0
      ? (coversByTitleKey.get(titleKey) ?? [])
      : [];

    const canonicalPublisher =
      coverCandidates.find((r) => r.publisher)?.publisher
      ?? fallbackPool.find((r) => r.publisher)?.publisher
      ?? null;

    const resolvedPublisher = resolvePublisher({
      cv: series.cv_publisher ?? canonicalPublisher,
      candidates: [series.publisher?.name ?? null, ...issuePublisherNames],
      seriesTitle: series.title,
    });

    return {
      series,
      titleKey,
      issueCount,
      yearStart,
      yearEnd,
      resolvedPublisher,
      coverCandidates,
      fallbackPool,
    };
  });

  // Phase 2: assign covers per title group with no reuse across volumes.
  const byTitleGroup = new Map();
  for (const entry of computed) {
    if (!byTitleGroup.has(entry.titleKey)) byTitleGroup.set(entry.titleKey, []);
    byTitleGroup.get(entry.titleKey).push(entry);
  }

  const coverPathByEntry = new Map();

  for (const [, group] of byTitleGroup) {
    const chronological = [...group].sort((a, b) => {
      const ay = a.yearStart ?? Number.POSITIVE_INFINITY;
      const by = b.yearStart ?? Number.POSITIVE_INFINITY;
      if (ay !== by) return ay - by;
      return (b.issueCount ?? 0) - (a.issueCount ?? 0);
    });

    const claimed = new Set();

    for (const entry of chronological) {
      const { yearStart, yearEnd, resolvedPublisher, coverCandidates, fallbackPool } = entry;
      const normPub = normalizePublisherForMatch(resolvedPublisher);
      // Prefer per-issue matched candidates; only fall back to title-only pool
      // if there are no per-issue matches at all.
      const effectivePool = coverCandidates.length > 0 ? coverCandidates : fallbackPool;

      const scoreCover = (row, { allowClaimed }) => {
        if (!row.storage_path) return -Infinity;
        if (!allowClaimed && claimed.has(row.storage_path)) return -Infinity;
        let score = 0;

        const coverYear = parseYear(row.cover_date);
        if (coverYear != null && yearStart != null && yearEnd != null) {
          if (coverYear >= yearStart && coverYear <= yearEnd) {
            score += 200;
            if (coverYear === yearStart) score += 40;
          } else {
            score -= Math.abs(coverYear - yearStart) * 10;
          }
        } else if (yearStart != null && coverYear == null) {
          score -= 500;
        }

        if (normPub && row.publisher) {
          if (normalizePublisherForMatch(row.publisher) === normPub) score += 60;
        }

        const issueStr = String(row.issue_number ?? "").trim();
        if (issueStr === "1" || issueStr === "#1") score += 50;

        return score;
      };

      const pickBest = ({ allowClaimed }) => {
        let best = null;
        let bestScore = -Infinity;
        for (const row of effectivePool) {
          const s = scoreCover(row, { allowClaimed });
          if (s > bestScore) {
            best = row;
            bestScore = s;
          }
        }
        return { row: best, score: bestScore };
      };

      // Quality threshold: only commit a cover if it actually fits this volume.
      // 200 = the year-in-range bonus, so this requires the cover_date to fall
      // within yearStart..yearEnd. Without this, cross-volume bleed happens —
      // a 2016 Batman cover ends up on the 1940 Batman row because there's no
      // disqualifying constraint, and the user clicks a 2016-looking tile and
      // lands on 1940 issues. Better to leave the cover null than mismatched.
      const COVER_SCORE_THRESHOLD = 200;

      let { row: bestCover, score: bestScore } = pickBest({ allowClaimed: false });
      if (!bestCover || bestScore < COVER_SCORE_THRESHOLD) {
        const reattempt = pickBest({ allowClaimed: true });
        if (reattempt.row && reattempt.score >= COVER_SCORE_THRESHOLD) {
          bestCover = reattempt.row;
          bestScore = reattempt.score;
        } else {
          bestCover = null;
        }
      }

      const path = bestCover?.storage_path ?? null;
      if (path) {
        claimed.add(path);
        coverPathByEntry.set(entry.series.id, path);
      }
    }
  }

  // Phase 3: write updates
  const now = new Date().toISOString();
  let updated = 0;

  for (const entry of computed) {
    const { series, issueCount, yearStart, yearEnd, resolvedPublisher } = entry;
    const featuredCoverPath = coverPathByEntry.get(series.id) ?? null;

    const { error: updErr } = await supabase
      .from("series")
      .update({
        issue_count_cached: issueCount,
        year_start_cached: yearStart,
        year_end_cached: yearEnd,
        resolved_publisher_cached: resolvedPublisher,
        featured_cover_path_cached: featuredCoverPath,
        search_refreshed_at: now,
      })
      .eq("id", series.id);

    if (updErr) {
      console.error(`Failed to update series ${series.id}:`, updErr);
      continue;
    }

    updated += 1;
  }

  return updated;
}

async function reportCoverage() {
  const { count: totalSeries, error: totalErr } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null);

  if (totalErr) {
    console.error("Coverage report failed (total):", totalErr);
    return;
  }

  const { count: nullStart, error: nullStartErr } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null)
    .is("year_start_cached", null);

  if (nullStartErr) {
    console.error("Coverage report failed (null year_start):", nullStartErr);
    return;
  }

  const { count: unrefreshed, error: unrefreshedErr } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null)
    .is("search_refreshed_at", null);

  if (unrefreshedErr) {
    console.error("Coverage report failed (unrefreshed):", unrefreshedErr);
    return;
  }

  const { count: nullCover, error: nullCoverErr } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null)
    .is("featured_cover_path_cached", null);

  if (nullCoverErr) {
    console.error("Coverage report failed (null cover):", nullCoverErr);
    return;
  }

  const withYear = (totalSeries ?? 0) - (nullStart ?? 0);
  const yearPct = totalSeries ? ((withYear / totalSeries) * 100).toFixed(1) : "0.0";
  const withCover = (totalSeries ?? 0) - (nullCover ?? 0);
  const coverPct = totalSeries ? ((withCover / totalSeries) * 100).toFixed(1) : "0.0";

  console.log("──────── Coverage ────────");
  console.log(`Total series (with gcd_id): ${totalSeries ?? 0}`);
  console.log(`With year_start_cached:     ${withYear} (${yearPct}%)`);
  console.log(`Missing year_start_cached:  ${nullStart ?? 0}`);
  console.log(`With featured_cover_path:   ${withCover} (${coverPct}%)`);
  console.log(`Missing featured_cover:     ${nullCover ?? 0}`);
  console.log(`Still unrefreshed:          ${unrefreshed ?? 0}`);
  console.log("──────────────────────────");
}

async function run() {
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (FORCE) console.log("Mode: --force (ignoring search_refreshed_at, walking by id cursor)");

  let total = 0;

  while (true) {
    const batch = await fetchSeriesBatch();
    if (batch.length === 0) break;

    const count = await processBatch(batch);
    total += count;
    console.log(`Processed ${count} (total ${total})`);

    if (count === 0) {
      console.error("Batch returned 0 updates — stopping to avoid infinite loop.");
      break;
    }
  }

  console.log("DONE. Total updated:", total);

  await reportCoverage();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
