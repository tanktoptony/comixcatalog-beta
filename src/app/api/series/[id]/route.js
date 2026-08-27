import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolvePublisher } from "@/lib/publisher";
import { stripPunctuation } from "@/lib/titleMatch";

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeIssueNumber(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSeriesTitle(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Strip variant/printing suffixes — same logic as the cache refresh.
// "1 [Newsstand]" → "1", "5/1981" → "5", "Annual 1" → null.
// See scripts/refreshSeriesSearchCache.js for the rationale.
function baseIssueNumber(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

// publication_date is null on ~65% of gcd_issues. key_date is GCD's sortable
// approximation that's populated more reliably. Fall back to it.
function bestYearFor(row) {
  return parseYear(row.publication_date) ?? parseYear(row.key_date);
}

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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

    if (!series.gcd_id) {
      return NextResponse.json({
        series: {
          id: series.id,
          title: series.title ?? "Untitled Series",
          publisher: series.publisher?.name ?? "Unknown Publisher",
          issue_count: 0,
          year_start: null,
          year_end: null,
          featured_cover: null,
          issues: [],
        },
      });
    }

    const [issuesResult, gcdSeriesResult] = await Promise.all([
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
    ]);

    const { data: issues, error: issuesError } = issuesResult;
    const seriesLevelPublisherGcdId = gcdSeriesResult.data?.publisher_gcd_id ?? null;

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
      const { data: gcdPublisherRows } = await supabase
        .from("gcd_publishers")
        .select("gcd_id, name")
        .in("gcd_id", publisherGcdIds);

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
      const queries = [];
      if (series.gcd_id != null) {
        queries.push(
          supabase
            .from("canonical_covers")
            .select("series_title, series_gcd_id, issue_number, series_year, cover_date, storage_path, publisher")
            .eq("series_gcd_id", series.gcd_id)
        );
      }
      if (series.title) {
        queries.push(
          supabase
            .from("canonical_covers")
            .select("series_title, series_gcd_id, issue_number, series_year, cover_date, storage_path, publisher")
            .eq("series_title", series.title)
            .is("series_gcd_id", null)
        );

        // Punctuation variant — ComicVine frequently drops colons/commas GCD
        // keeps ("DC Comics: Bombshells" → "DC Comics Bombshells"), which
        // silently stranded every cover for that title from this exact-match
        // lookup. Only queried when it actually differs from the raw title.
        const strippedTitle = stripPunctuation(series.title);
        if (strippedTitle && strippedTitle !== series.title) {
          queries.push(
            supabase
              .from("canonical_covers")
              .select("series_title, series_gcd_id, issue_number, series_year, cover_date, storage_path, publisher")
              .eq("series_title", strippedTitle)
              .is("series_gcd_id", null)
          );
        }
      }
      const settled = await Promise.all(queries);
      const merged = new Map();
      for (const { data, error } of settled) {
        if (error) {
          console.error("GET /api/series/[id] canonical cover lookup failed:", error);
          continue;
        }
        for (const row of data ?? []) {
          merged.set(`${row.series_gcd_id ?? "_"}::${row.series_title ?? "_"}::${row.issue_number}::${row.storage_path ?? "_"}`, row);
        }
      }
      canonicalRows = [...merged.values()];
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

    // Key by issue_number only. We already constrained canonicalRows to
    // this series (via series_gcd_id OR exact series_title), so cross-series
    // pollution isn't possible. Keying by the canonical row's series_title
    // would break the ID-path case where canonical's title differs from
    // series.title (e.g. Marvel's "G.I. Joe, a Real American Hero" vs CV's
    // "G.I. Joe: A Real American Hero").
    const candidatesByIssue = canonicalRows.reduce((acc, row) => {
      if (!row?.storage_path) return acc;
      const key = normalizeIssueNumber(row.issue_number);
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    // Series year span — used as the tolerance window for picking a canonical
    // cover. Without this, a 2022 "Robin: The Lazarus Tournament" cover ends
    // up assigned to the 1993 Robin #1 because canonical_covers only has the
    // recent run ingested.
    const seriesYears = issueRows
      .map((row) => bestYearFor(row))
      .filter((y) => y != null);
    const seriesYearMin = seriesYears.length ? Math.min(...seriesYears) : null;
    const seriesYearMax = seriesYears.length ? Math.max(...seriesYears) : null;
    const COVER_YEAR_TOLERANCE = 1;

    const mappedIssuesRaw = issueRows.map((issue) => {
      const gcdYear = bestYearFor(issue);

      const issueKey = normalizeIssueNumber(issue.issue_number);

      // For the fallback path, only accept covers whose series_year sits
      // inside this series's actual year span (with a small tolerance). If
      // every candidate fails that test, return no cover rather than the
      // wrong one. This stops cross-volume bleed at the per-issue level.
      const allCandidates = candidatesByIssue[issueKey] ?? [];
      const inSpanCandidates =
        seriesYearMin != null && seriesYearMax != null
          ? allCandidates.filter(
              (row) =>
                row.series_year != null &&
                Number(row.series_year) >= seriesYearMin - COVER_YEAR_TOLERANCE &&
                Number(row.series_year) <= seriesYearMax + COVER_YEAR_TOLERANCE
            )
          : allCandidates;

      // Pick the candidate whose cover_date / series_year is closest to the
      // issue's publication year. If GCD doesn't have a publication_date,
      // any in-span candidate is fine — pick the first by cover_date.
      const ranked = [...inSpanCandidates].sort((a, b) => {
        const aYear = parseYear(a.cover_date) ?? Number(a.series_year ?? 0);
        const bYear = parseYear(b.cover_date) ?? Number(b.series_year ?? 0);
        if (gcdYear != null) {
          return Math.abs(aYear - gcdYear) - Math.abs(bYear - gcdYear);
        }
        return aYear - bYear;
      });

      const best = ranked[0] ?? null;
      const storagePath = best?.storage_path ?? null;

      // Year fallback: if gcd_issues.publication_date is missing, fall back to
      // the chosen canonical cover's cover_date (per-issue) or its series_year.
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
      series: {
        id: series.id,
        title: series.title ?? "Untitled Series",
        publisher: resolvedPublisher,
        issue_count: mappedIssues.length,
        year_start: fullYearStart,
        year_end: fullYearEnd,
        featured_cover: featuredCover,
        issues: mappedIssues,
      },
    });
  } catch (err) {
    console.error("GET /api/series/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
