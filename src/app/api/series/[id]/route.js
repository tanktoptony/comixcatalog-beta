import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { fetchSeriesCoverRows, resolveCovers } from "@/lib/catalog/covers";
import { resolvePublisher } from "@/lib/publisher";
import { collectsLines, formatLabel, isCollectedEdition } from "@/lib/seriesFormat";
import { CDN_CACHE_SHORT } from "@/lib/cdnCache";
import { baseIssueNumber } from "@/lib/coverMatch";
import { bestYearFor, parseYear } from "@/lib/years";

// Strip variant/printing suffixes — same logic as the cache refresh.
// "1 [Newsstand]" → "1", "5/1981" → "5", "Annual 1" → null.
// See scripts/refreshSeriesSearchCache.js for the rationale.
// publication_date is null on ~65% of gcd_issues. key_date is GCD's sortable
// approximation that's populated more reliably. Fall back to it.
// Dedupe by BASE issue number so "1", "1 [Newsstand]", "1 [Variant Cover]"
// collapse to a single issue. When duplicates exist, prefer the row with the
// earliest valid date (original printing beats reprints) and prefer dated
// rows over undated. This will become "issues + variants" once the schema
// gets variant fields; today it just produces the correct issue count.
function dedupeIssuesByBase(issues) {
  const byBase = new Map();
  for (const issue of issues) {
    const base = baseIssueNumber(issue.issue_number);
    if (!base) continue;
    const existing = byBase.get(base);
    if (!existing) {
      byBase.set(base, issue);
      continue;
    }
    const existingYear = bestYearFor(existing);
    const candidateYear = bestYearFor(issue);
    if (
      candidateYear != null &&
      (existingYear == null || candidateYear < existingYear)
    ) {
      byBase.set(base, issue);
    }
  }
  return [...byBase.values()];
}

export async function GET(req, context) {
  try {
    const { id } = await context.params;

    const supabase = getServiceClient();
    let degraded = false;

    const { data: series, error: seriesError } = await supabase
      .from("series")
      .select(`
        id,
        gcd_id,
        title,
        publisher_id,
        cv_publisher,
        resolved_publisher_cached,
        publisher:publisher_id (
          id,
          name,
          gcd_id
        )
      `)
      .eq("id", id)
      .single();

    if (seriesError || !series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // No GCD linkage at all — a brand-new or never-catalogued real series.
    // GCD's metadata mirror is a point-in-time dump plus a weekly top-up
    // scoped to ~79 curated titles (see gcd-issue-refresh.yml); anything
    // outside that list that launched after the dump simply has no
    // gcd_series/gcd_issues row, full stop — not stale, absent. This used
    // to unconditionally return zero issues here, even when real
    // ComicVine-sourced covers already exist and are correctly title-tagged
    // (found 2026-08-27: Swamp Thing 1989, Godzilla Conquers the Multiverse,
    // Big Rig and others had a bare series row and real ingested covers but
    // showed "0 issues" because this branch never looked at canonical_covers
    // at all). Pure title-path only — there's no series_gcd_id to ID-match
    // on, so this can't reach the volume-exact guarantee the gcd_id path
    // below relies on; that's the same trade-off the title-path already
    // makes there.
    if (!series.gcd_id) {
      let coverRows = [];
      try {
        coverRows = await fetchSeriesCoverRows(supabase, { seriesTitles: [series.title] });
      } catch (error) {
        console.error("GET /api/series/[id] gcd-less title lookup failed:", error);
        degraded = true;
      }
      const byBase = new Map();
      for (const row of coverRows) {
          if (!row.storage_path) continue;
          const base = baseIssueNumber(row.issue_number);
          if (!base) continue;
          const existing = byBase.get(base);
          const rowYear = parseYear(row.cover_date) ?? Number(row.series_year ?? 0);
          if (!existing || rowYear < existing.year) byBase.set(base, { row, year: rowYear });
      }
      const mappedIssues = [...byBase.entries()]
        .map(([base, { row }]) => ({
          id: `cvt-${encodeURIComponent(series.title ?? "")}-${base}`,
          title: null,
          issue_number: row.issue_number,
          release_year: parseYear(row.cover_date) ?? Number(row.series_year ?? null) ?? null,
          publication_date: null,
          cover: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${row.storage_path}`,
        }))
        .sort((a, b) => Number(a.issue_number) - Number(b.issue_number) || 0);

      const years = mappedIssues.map((i) => i.release_year).filter((y) => y != null);
      const cvPublisher = coverRows.find((row) => row.publisher)?.publisher ?? null;

      return NextResponse.json({
        ...(degraded ? { degraded: true } : {}),
        series: {
          id: series.id,
          title: series.title ?? "Untitled Series",
          publisher:
            series.resolved_publisher_cached ||
            series.publisher?.name ||
            cvPublisher ||
            "Unknown Publisher",
          issue_count: mappedIssues.length,
          year_start: years.length ? Math.min(...years) : null,
          year_end: years.length ? Math.max(...years) : null,
          featured_cover: mappedIssues.find((i) => i.cover)?.cover ?? null,
          issues: mappedIssues,
        },
      }, degraded ? undefined : { headers: CDN_CACHE_SHORT });
    }

    const [issuesResult, gcdSeriesResult, gcdFormatResult] = await Promise.all([
      supabase
        .from("gcd_issues")
        .select(`
          gcd_id,
          series_gcd_id,
          publisher_gcd_id,
          issue_number,
          title,
          publication_date,
          key_date
        `)
        .eq("series_gcd_id", series.gcd_id)
        .order("gcd_id", { ascending: true })
        .limit(500),
      // Series-level publisher per GCD. More reliable than per-issue
      // publisher_gcd_id, which is often a distributor or shell company.
      supabase
        .from("gcd_series")
        .select("publisher_gcd_id")
        .eq("gcd_id", series.gcd_id)
        .single(),
      // Publishing format (migration 0028), queried on its own so a missing
      // column degrades to "unknown format" rather than losing the publisher.
      supabase
        .from("gcd_series")
        .select("publishing_format, binding, format_notes")
        .eq("gcd_id", series.gcd_id)
        .maybeSingle(),
    ]);

    const { data: issues, error: issuesError } = issuesResult;
    const seriesLevelPublisherGcdId = gcdSeriesResult.data?.publisher_gcd_id ?? null;
    const seriesFormat = gcdFormatResult.error ? null : gcdFormatResult.data;
    // Collected editions share a title with the run they collect, so the
    // title-keyed cover lookups below would hand them the monthly's art.
    // Their covers come through series_gcd_id or not at all.
    const collectedEdition = isCollectedEdition(seriesFormat ?? {});

    if (issuesError) {
      console.error("GET /api/series/[id] gcd issues failed:", issuesError);
      return NextResponse.json(
        { error: "Failed to load issues" },
        { status: 500 }
      );
    }

    const issueRows = issues ?? [];

    const publisherGcdIds = [
      ...new Set(
        [
          seriesLevelPublisherGcdId,
          ...issueRows.map((row) => row.publisher_gcd_id),
        ]
          .filter(Boolean)
          .map((v) => String(v))
      ),
    ];

    let gcdPublisherNames = [];
    let seriesLevelPublisherName = null;
    if (publisherGcdIds.length > 0) {
      const { data: gcdPublisherRows, error: gcdPublisherRowsError } = await supabase
        .from("gcd_publishers")
        .select("gcd_id, name")
        .in("gcd_id", publisherGcdIds);
      if (gcdPublisherRowsError) {
        console.error("series publisher lookup failed:", gcdPublisherRowsError.code, gcdPublisherRowsError.message);
        degraded = true;
      }

      const nameByGcdId = new Map(
        (gcdPublisherRows ?? []).map((row) => [String(row.gcd_id), row.name])
      );

      seriesLevelPublisherName = seriesLevelPublisherGcdId
        ? nameByGcdId.get(String(seriesLevelPublisherGcdId)) ?? null
        : null;

      gcdPublisherNames = [...nameByGcdId.values()].filter(Boolean);
    }

    const localPublisherName = series.publisher?.name ?? null;
    const cvPublisherName = series.cv_publisher ?? null;

    const years = issueRows
      .map((issue) => bestYearFor(issue))
      .filter((year) => year != null);

    const yearStart = years.length ? Math.min(...years) : null;
    const yearEnd = years.length ? Math.max(...years) : null;

    const issueNumbers = [
      ...new Set(
        issueRows
          .map((row) => row.issue_number)
          .filter((value) => value != null)
      ),
    ];

    // Two-path canonical-cover lookup:
    //   1. ID path — match canonical_covers.series_gcd_id == series.gcd_id.
    //      Volume-exact; immune to title drift (mojibake, casing, comma vs
    //      colon — the "G.I. Joe, a Real American Hero" Marvel run vs
    //      "G.I. Joe: A Real American Hero" IDW form bit us until this).
    //   2. Title path — for canonical_covers rows the backfill couldn't tag.
    // Union the results; downstream dedupe (candidatesByIssue) handles
    // duplicates from rows that match both paths.
    let canonicalRows = [];
    if (issueNumbers.length > 0) {
      try {
        canonicalRows = await fetchSeriesCoverRows(supabase, {
          seriesGcdIds: [series.gcd_id],
          seriesTitles: collectedEdition ? [] : [series.title],
        });
      } catch (error) {
        console.error("GET /api/series/[id] canonical cover lookup failed:", error);
        degraded = true;
      }
    }

    const canonicalPublisherName =
      canonicalRows.find((row) => row.publisher)?.publisher ?? null;

    // Prefer the precomputed cached value. It went through the audit
    // pipeline (scripts/repairSeriesPublishersWithCv.js) which applies the
    // year-aware logic — modern era trusts cv_publisher, pre-2000 prefers
    // GCD indicia. Re-resolving here on every request would bypass that
    // and reintroduce the bug where 1984 TMNT showed "IDW Publishing"
    // because IDW currently owns the IP. Only re-resolve as a fallback.
    const resolvedPublisher =
      series.resolved_publisher_cached ||
      resolvePublisher({
        cv: cvPublisherName ?? canonicalPublisherName,
        candidates: [
          localPublisherName,
          seriesLevelPublisherName,
          ...gcdPublisherNames,
        ],
        seriesTitle: series.title,
      });

    let resolvedCovers = new Map();

    // Series year span — used as the tolerance window for picking a canonical
    // cover. Without this, a 2022 "Robin: The Lazarus Tournament" cover ends
    // up assigned to the 1993 Robin #1 because canonical_covers only has the
    // recent run ingested.
    const seriesYears = issueRows
      .map((row) => bestYearFor(row))
      .filter((y) => y != null);
    const seriesYearMin = seriesYears.length ? Math.min(...seriesYears) : null;
    const seriesYearMax = seriesYears.length ? Math.max(...seriesYears) : null;
    try {
      resolvedCovers = await resolveCovers(supabase, issueRows.map((issue) => ({
        gcd_issue_id: issue.gcd_id,
        series_gcd_id: issue.series_gcd_id,
        series_title: collectedEdition ? null : series.title,
        issue_number: issue.issue_number,
        year: bestYearFor(issue),
        series_year_start: seriesYearMin,
        series_year_end: seriesYearMax,
      })));
    } catch (error) {
      console.error("GET /api/series/[id] cover resolution failed:", error);
      degraded = true;
    }

    const mappedIssuesRaw = issueRows.map((issue) => {
      const gcdYear = bestYearFor(issue);
      const best = resolvedCovers.get(issue.gcd_id) ?? null;
      const storagePath = best?.storage_path ?? null;
      const releaseYear =
        gcdYear ??
        (best ? parseYear(best.cover_date) ?? Number(best.series_year ?? null) : null) ??
        null;

      return {
        id: `gcd-${issue.gcd_id}`,
        title: issue.title ?? null,
        issue_number: issue.issue_number,
        release_year: releaseYear,
        publication_date: issue.publication_date ?? null,
        cover: storagePath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`
          : null,
      };
    });

    // Orphan-cover backfill: gcd_issues is a point-in-time GCD mirror and goes
    // stale for any series still actively publishing — GCD's own data is also
    // prone to splitting one real series across several series_gcd_ids as new
    // issues get added (the "Absolute Batman" case, 2026-08-27: ComicVine had
    // all 23 real issues correctly ingested and tagged to this series_gcd_id,
    // but gcd_issues here only ever synced issue #1, so 22 real, correctly
    // linked covers were sitting in canonical_covers completely invisible on
    // the page). Only the ID-path canonicalRows are eligible — volume-exact,
    // same guarantee the cover-matching above already relies on — never the
    // looser title-path rows, which could pull in wrong-volume phantom issues
    // for a series that only ever matched by title.
    const knownBaseIssues = new Set(
      mappedIssuesRaw.map((issue) => baseIssueNumber(issue.issue_number)).filter(Boolean)
    );
    const orphanCoversByBase = new Map();
    if (series.gcd_id != null) {
      for (const row of canonicalRows) {
        if (row.series_gcd_id !== series.gcd_id || !row.storage_path) continue;
        const base = baseIssueNumber(row.issue_number);
        if (!base || knownBaseIssues.has(base)) continue;
        const existing = orphanCoversByBase.get(base);
        const rowYear = parseYear(row.cover_date) ?? Number(row.series_year ?? 0);
        if (!existing || rowYear < existing.year) {
          orphanCoversByBase.set(base, { row, year: rowYear });
        }
      }
    }
    const orphanIssues = [...orphanCoversByBase.entries()].map(([base, { row }]) => ({
      id: `cv-${series.gcd_id}-${base}`,
      title: null,
      issue_number: row.issue_number,
      release_year: parseYear(row.cover_date) ?? Number(row.series_year ?? null) ?? null,
      publication_date: null,
      cover: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${row.storage_path}`,
    }));

    const mappedIssues = dedupeIssuesByBase([...mappedIssuesRaw, ...orphanIssues]);
    const featuredCover =
      mappedIssues.find((issue) => issue.cover)?.cover ?? null;

    const allYears = mappedIssues
      .map((issue) => issue.release_year)
      .filter((year) => year != null);
    const fullYearStart = allYears.length ? Math.min(yearStart ?? Infinity, ...allYears) : yearStart;
    const fullYearEnd = allYears.length ? Math.max(yearEnd ?? -Infinity, ...allYears) : yearEnd;

    return NextResponse.json({
      degraded,
      series: {
        id: series.id,
        title: series.title ?? "Untitled Series",
        publisher: resolvedPublisher,
        issue_count: mappedIssues.length,
        year_start: fullYearStart,
        year_end: fullYearEnd,
        featured_cover: featuredCover,
        format_label: formatLabel(seriesFormat ?? {}),
        collects: collectedEdition ? collectsLines(seriesFormat?.format_notes) : [],
        issues: mappedIssues,
      },
    // A degraded response must not be cached at the CDN for ten minutes.
    }, degraded ? undefined : { headers: CDN_CACHE_SHORT });
  } catch (err) {
    console.error("GET /api/series/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
