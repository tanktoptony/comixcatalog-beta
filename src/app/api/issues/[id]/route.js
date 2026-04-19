import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function resolvePublisherFromComicVine(
  supabase,
  seriesTitle,
  issueNumber,
  fallbackPublisher = null
) {
  if (!seriesTitle) return fallbackPublisher;

  const exact = await supabase
    .from("canonical_covers")
    .select("publisher")
    .eq("series_title", seriesTitle)
    .eq("issue_number", issueNumber)
    .not("publisher", "is", null)
    .limit(1);

  const exactPublisher = exact.data?.[0]?.publisher ?? null;
  if (exactPublisher) return exactPublisher;

  const bySeries = await supabase
    .from("canonical_covers")
    .select("publisher")
    .eq("series_title", seriesTitle)
    .not("publisher", "is", null)
    .limit(1);

  return bySeries.data?.[0]?.publisher ?? fallbackPublisher;
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeIssueNumber(value) {
  return String(value ?? "").trim().toLowerCase();
}

function issueSortValue(issueNumber) {
  const raw = String(issueNumber ?? "").trim();

  if (!raw) return Number.MAX_SAFE_INTEGER;

  const num = Number(raw);
  if (!Number.isNaN(num)) return num;

  const match = raw.match(/^(-?\d+(\.\d+)?)/);
  if (match) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Number.MAX_SAFE_INTEGER;
}

function isReasonableIssueNumber(issueNumber) {
  const raw = String(issueNumber ?? "").trim();
  if (!raw) return false;

  const num = Number(raw);
  if (!Number.isNaN(num)) {
    return num >= 0;
  }

  const match = raw.match(/^(\d+(\.\d+)?)/);
  return !!match;
}

function dedupeSeriesIssueRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = normalizeIssueNumber(row.issue_number);
    if (!key) continue;
    if (!isReasonableIssueNumber(row.issue_number)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
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

    if (String(id).startsWith("gcd-")) {
      const gcdId = String(id).replace(/^gcd-/, "");

      const { data: issue, error: issueError } = await supabase
        .from("gcd_issues")
        .select(`
          gcd_id,
          series_gcd_id,
          publisher_gcd_id,
          issue_number,
          title,
          publication_date
        `)
        .eq("gcd_id", gcdId)
        .single();

      if (issueError || !issue) {
        return NextResponse.json({ error: "Issue not found" }, { status: 404 });
      }

      const { data: seriesRow } = await supabase
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
        .eq("gcd_id", issue.series_gcd_id)
        .single();

      let gcdPublisherName = null;
      if (issue.publisher_gcd_id) {
        const { data: gcdPublisherRow } = await supabase
          .from("gcd_publishers")
          .select("gcd_id, name")
          .eq("gcd_id", issue.publisher_gcd_id)
          .single();

        gcdPublisherName = gcdPublisherRow?.name ?? null;
      }

      const seriesId = seriesRow?.id ?? null;
      const seriesTitle = seriesRow?.title ?? issue.title ?? null;
      const rawPublisherName =
        seriesRow?.publisher?.name ??
        (seriesRow?.publisher?.gcd_id ? gcdPublisherName : null) ??
        gcdPublisherName ??
        null;

      const publisherName = await resolvePublisherFromComicVine(
        supabase,
        seriesTitle,
        issue.issue_number,
        rawPublisherName
      );

      let cover = null;
      if (seriesTitle && issue.issue_number != null) {
        const { data: canonicalRows } = await supabase
          .from("canonical_covers")
          .select("storage_path")
          .eq("series_title", seriesTitle)
          .eq("issue_number", issue.issue_number)
          .not("storage_path", "is", null)
          .limit(1);

        const storagePath = canonicalRows?.[0]?.storage_path ?? null;
        if (storagePath) {
          cover = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`;
        }
      }

      let prevIssue = null;
      let nextIssue = null;
      let relatedIssues = [];

      if (issue.series_gcd_id) {
        const { data: allIssues } = await supabase
          .from("gcd_issues")
          .select(`
            gcd_id,
            issue_number,
            title,
            publication_date
          `)
          .eq("series_gcd_id", issue.series_gcd_id)
          .order("gcd_id", { ascending: true })
          .limit(500);

        const mappedRaw = (allIssues ?? []).map((row) => ({
          id: `gcd-${row.gcd_id}`,
          issue_number: row.issue_number,
          title: row.title ?? null,
          release_year: parseYear(row.publication_date),
        }));

        const mapped = dedupeSeriesIssueRows(mappedRaw).sort(
          (a, b) => issueSortValue(a.issue_number) - issueSortValue(b.issue_number)
        );

        const currentIssueKey = normalizeIssueNumber(issue.issue_number);
        const currentIndex = mapped.findIndex(
          (row) => normalizeIssueNumber(row.issue_number) === currentIssueKey
        );

        if (currentIndex > 0) {
          prevIssue = mapped[currentIndex - 1];
        }

        if (currentIndex >= 0 && currentIndex < mapped.length - 1) {
          nextIssue = mapped[currentIndex + 1];
        }

        if (currentIndex >= 0) {
          relatedIssues = mapped
            .filter((_, idx) => idx >= currentIndex - 2 && idx <= currentIndex + 2)
            .filter((row) => normalizeIssueNumber(row.issue_number) !== currentIssueKey)
            .slice(0, 4);
        }
      }

      return NextResponse.json({
        issue: {
          id: `gcd-${issue.gcd_id}`,
          source: "gcd",
          series_id: seriesId,
          series_title: seriesTitle,
          issue_number: issue.issue_number,
          release_year: parseYear(issue.publication_date),
          publication_date: issue.publication_date ?? null,
          publisher: publisherName,
          cover,
          created_by: null,
          prev_issue: prevIssue,
          next_issue: nextIssue,
          related_issues: relatedIssues,
          market: {
            listings_count: 0,
            low: null,
            median: null,
            high: null,
          },
        },
      });
    }

    const { data: comic, error: comicError } = await supabase
      .from("comics")
      .select(`
        id,
        series_title,
        publisher,
        issue_number,
        release_year,
        created_by,
        comic_covers (
          image_path,
          is_primary
        )
      `)
      .eq("id", id)
      .single();

    if (comicError || !comic) {
      return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    }

    const userCoverPath =
      comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null;

    return NextResponse.json({
      issue: {
        id: comic.id,
        source: "user",
        series_id: null,
        series_title: comic.series_title ?? null,
        issue_number: comic.issue_number ?? null,
        release_year: comic.release_year ?? null,
        publication_date: null,
        publisher: comic.publisher ?? null,
        cover: userCoverPath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${userCoverPath}`
          : null,
        created_by: comic.created_by ?? null,
        prev_issue: null,
        next_issue: null,
        related_issues: [],
        market: {
          listings_count: 0,
          low: null,
          median: null,
          high: null,
        },
      },
    });
  } catch (err) {
    console.error("GET /api/issues/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}