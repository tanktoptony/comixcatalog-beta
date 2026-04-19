import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function normalizePublisherName(value) {
  return String(value ?? "").trim();
}

function isSuspiciousPublisherName(publisherName, seriesTitle) {
  const pub = normalizePublisherName(publisherName).toLowerCase();
  const title = String(seriesTitle ?? "").trim().toLowerCase();

  if (!pub) return true;
  if (pub === "unknown publisher") return true;

  if (title && pub.includes(title)) return true;

  if (
    pub.includes("publishing company") ||
    pub.includes("publishing co") ||
    pub.includes("company inc") ||
    pub.includes("publications inc") ||
    pub.includes("publishers inc") ||
    pub.includes("comics inc")
  ) {
    return true;
  }

  return false;
}

function normalizePublisherLabel(value) {
  const pub = String(value ?? "").trim();
  if (!pub) return null;

  const lower = pub.toLowerCase();

  const exactMap = {
    "marvel": "Marvel Comics",
    "marvel comics": "Marvel Comics",
    "marvel comics group": "Marvel Comics",
    "marvel comic": "Marvel Comics",

    "atlas magazines": "Marvel Comics",
    "atlas magazines inc": "Marvel Comics",
    "atlas magazines inc.": "Marvel Comics",
    "magazine management": "Marvel Comics",
    "magazine management co inc": "Marvel Comics",
    "magazine management co. inc.": "Marvel Comics",
    "magazine management co., inc.": "Marvel Comics",

    "dc": "DC Comics",
    "dc comics": "DC Comics",
    "dc comics inc": "DC Comics",
    "dc comics inc.": "DC Comics",
    "dc comics, inc.": "DC Comics",
    "dc comics group": "DC Comics",
    "detective comics": "DC Comics",
    "detective comics inc": "DC Comics",
    "detective comics inc.": "DC Comics",
    "detective comics, inc.": "DC Comics",
    "national periodical publications": "DC Comics",
    "national periodical publications inc": "DC Comics",
    "national periodical publications inc.": "DC Comics",

    "top cow": "Top Cow Comics",
    "top cow comics": "Top Cow Comics",

    "image": "Image Comics",
    "image comics": "Image Comics",
    "image comics inc": "Image Comics",
    "image comics, inc.": "Image Comics",

    "dark horse": "Dark Horse Comics",
    "dark horse comics": "Dark Horse Comics",
    "dark horse comics inc.": "Dark Horse Comics",

    "boom": "BOOM! Studios",
    "boom studios": "BOOM! Studios",
    "boom! studios": "BOOM! Studios",

    "idw": "IDW Publishing",
    "idw publishing": "IDW Publishing",

    "vertigo": "Vertigo",
    "vertigo comics": "Vertigo",

    "archie": "Archie Comics",
    "archie comics": "Archie Comics",

    "valiant": "Valiant Comics",
    "valiant comics": "Valiant Comics",

    "dynamite": "Dynamite Entertainment",
    "dynamite entertainment": "Dynamite Entertainment",

    "wonder woman publishing company inc": "DC Comics",
    "wonder woman publishing company inc.": "DC Comics",
    "olympia publications inc": "Marvel Comics",
    "olympia publications inc.": "Marvel Comics",
  };

  if (exactMap[lower]) return exactMap[lower];

  if (lower.includes("marvel")) return "Marvel Comics";
  if (lower.includes("atlas magazines")) return "Marvel Comics";
  if (lower.includes("magazine management")) return "Marvel Comics";

  if (lower.includes("dc comics")) return "DC Comics";
  if (lower.includes("detective comics")) return "DC Comics";
  if (lower.includes("national periodical")) return "DC Comics";

  if (lower.includes("top cow")) return "Top Cow Comics";
  if (lower.includes("image")) return "Image Comics";
  if (lower.includes("dark horse")) return "Dark Horse Comics";
  if (lower.includes("boom")) return "BOOM! Studios";
  if (lower.includes("idw")) return "IDW Publishing";
  if (lower.includes("vertigo")) return "Vertigo";
  if (lower.includes("archie")) return "Archie Comics";
  if (lower.includes("valiant")) return "Valiant Comics";
  if (lower.includes("dynamite")) return "Dynamite Entertainment";

  return null;
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

    const { data: issues, error: issuesError } = await supabase
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
      .limit(500);

    if (issuesError) {
      console.error("GET /api/series/[id] gcd issues failed:", issuesError);
      return NextResponse.json(
        { error: "Failed to load issues" },
        { status: 500 }
      );
    }

    const issueRows = issues ?? [];

    let gcdPublisherName = null;
    const firstPublisherGcdId =
      issueRows.find((row) => row.publisher_gcd_id)?.publisher_gcd_id ?? null;

    if (firstPublisherGcdId) {
      const { data: gcdPublisherRow } = await supabase
        .from("gcd_publishers")
        .select("gcd_id, name")
        .eq("gcd_id", firstPublisherGcdId)
        .single();

      gcdPublisherName = gcdPublisherRow?.name ?? null;
    }

    const localPublisherName = series.publisher?.name ?? null;

    const normalizedLocalPublisher = normalizePublisherLabel(localPublisherName);
    const normalizedGcdPublisher = normalizePublisherLabel(gcdPublisherName);

    const trustedLocalPublisher = !isSuspiciousPublisherName(
      localPublisherName,
      series.title
    )
      ? localPublisherName
      : null;

    const trustedGcdPublisher = !isSuspiciousPublisherName(
      gcdPublisherName,
      series.title
    )
      ? gcdPublisherName
      : null;

    const resolvedPublisher =
      normalizedLocalPublisher ??
      normalizedGcdPublisher ??
      trustedLocalPublisher ??
      trustedGcdPublisher ??
      "Unknown Publisher";

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
        .select("series_title, issue_number, series_year, storage_path")
        .eq("series_title", series.title)
        .in("issue_number", issueNumbers)
        .not("storage_path", "is", null);

      if (error) {
        console.error(
          "GET /api/series/[id] canonical cover lookup failed:",
          error
        );
      } else {
        canonicalRows = data ?? [];
        const allowedYears = new Set(
          issueRows
            .map((row) => parseYear(row.publication_date))
            .filter((year) => year != null)
        );

        canonicalRows = canonicalRows.filter((row) => {
          if (row.series_year == null) return true; // keep legacy rows for non-ambiguous fallback
          return allowedYears.has(Number(row.series_year));
        });
      }
    }

    const canonicalLookupByYear = Object.fromEntries(
      canonicalRows
        .filter((row) => row.series_year != null)
        .map((row) => [
          `${normalizeSeriesTitle(row.series_title)}::${normalizeIssueNumber(row.issue_number)}::${String(row.series_year)}`,
          row.storage_path,
        ])
    );

    const legacyCandidatesByIssue = canonicalRows.reduce((acc, row) => {
      const key =
        `${normalizeSeriesTitle(row.series_title)}::${normalizeIssueNumber(row.issue_number)}`;

      if (!acc[key]) acc[key] = [];

      if (row?.storage_path) {
        acc[key].push(row.storage_path);
      }

      return acc;
    }, {});

    const mappedIssuesRaw = issueRows.map((issue) => {
      const issueYear = parseYear(issue.publication_date);

      const yearAwareKey =
        `${normalizeSeriesTitle(series.title)}::${normalizeIssueNumber(issue.issue_number)}::${String(issueYear ?? "")}`;

      const legacyKey =
        `${normalizeSeriesTitle(series.title)}::${normalizeIssueNumber(issue.issue_number)}`;

      const yearAwareStoragePath = canonicalLookupByYear[yearAwareKey] ?? null;

      const legacyCandidates = legacyCandidatesByIssue[legacyKey] ?? [];
      const uniqueLegacyCandidates = [...new Set(legacyCandidates)];
      const legacyStoragePath =
        uniqueLegacyCandidates.length === 1 ? uniqueLegacyCandidates[0] : null;

      const storagePath =
        yearAwareStoragePath ??
        legacyStoragePath ??
        null;

      return {
        id: `gcd-${issue.gcd_id}`,
        title: issue.title ?? null,
        issue_number: issue.issue_number,
        release_year: issueYear,
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