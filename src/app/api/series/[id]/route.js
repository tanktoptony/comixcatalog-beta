import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolvePublisher } from "@/lib/publisher";

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

function dedupeIssuesByNumber(issues) {
  const seen = new Set();
  const out = [];

  for (const issue of issues) {
    const key = String(issue.issue_number ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }

  return out;
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
          publication_date
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
      .map((issue) => parseYear(issue.publication_date))
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

    let canonicalRows = [];
    if (issueNumbers.length > 0) {
      const { data, error } = await supabase
        .from("canonical_covers")
        .select("series_title, issue_number, series_year, cover_date, storage_path, publisher")
        .eq("series_title", series.title)
        .in("issue_number", issueNumbers);

      if (error) {
        console.error(
          "GET /api/series/[id] canonical cover lookup failed:",
          error
        );
      } else {
        canonicalRows = data ?? [];
      }
    }

    const canonicalPublisherName =
      canonicalRows.find((row) => row.publisher)?.publisher ?? null;

    const resolvedPublisher = resolvePublisher({
      cv: cvPublisherName ?? canonicalPublisherName,
      // gcd_series publisher (series-level) is preferred over per-issue
      // publishers, which are often distributors or short-lived shells.
      candidates: [
        localPublisherName,
        seriesLevelPublisherName,
        ...gcdPublisherNames,
      ],
      seriesTitle: series.title,
    });

    const candidatesByIssue = canonicalRows.reduce((acc, row) => {
      const key =
        `${normalizeSeriesTitle(row.series_title)}::${normalizeIssueNumber(row.issue_number)}`;

      if (!acc[key]) acc[key] = [];

      if (row?.storage_path) {
        acc[key].push(row);
      }

      return acc;
    }, {});

    // Series year span — used as the tolerance window for picking a canonical
    // cover. Without this, a 2022 "Robin: The Lazarus Tournament" cover ends
    // up assigned to the 1993 Robin #1 because canonical_covers only has the
    // recent run ingested.
    const seriesYears = issueRows
      .map((row) => parseYear(row.publication_date))
      .filter((y) => y != null);
    const seriesYearMin = seriesYears.length ? Math.min(...seriesYears) : null;
    const seriesYearMax = seriesYears.length ? Math.max(...seriesYears) : null;
    const COVER_YEAR_TOLERANCE = 1;

    const mappedIssuesRaw = issueRows.map((issue) => {
      const gcdYear = parseYear(issue.publication_date);

      const legacyKey =
        `${normalizeSeriesTitle(series.title)}::${normalizeIssueNumber(issue.issue_number)}`;

      // For the fallback path, only accept covers whose series_year sits
      // inside this series's actual year span (with a small tolerance). If
      // every candidate fails that test, return no cover rather than the
      // wrong one. This stops cross-volume bleed at the per-issue level.
      const allCandidates = candidatesByIssue[legacyKey] ?? [];
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

    const mappedIssues = dedupeIssuesByNumber(mappedIssuesRaw);
    const featuredCover =
      mappedIssues.find((issue) => issue.cover)?.cover ?? null;

    return NextResponse.json({
      series: {
        id: series.id,
        title: series.title ?? "Untitled Series",
        publisher: resolvedPublisher,
        issue_count: mappedIssues.length,
        year_start: yearStart,
        year_end: yearEnd,
        featured_cover: featuredCover,
        issues: mappedIssues,
      },
    });
  } catch (err) {
    console.error("GET /api/series/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}