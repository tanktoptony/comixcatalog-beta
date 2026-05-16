import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolvePublisher } from "@/lib/publisher";

async function fetchCanonicalMatch(supabase, seriesTitle, issueNumber, targetYear) {
  if (!seriesTitle) return { storage_path: null, publisher: null };

  const { data: exactRows } = await supabase
    .from("canonical_covers")
    .select("storage_path, publisher, cover_date")
    .eq("series_title", seriesTitle)
    .eq("issue_number", issueNumber);

  const best = pickBestCoverRow(exactRows, targetYear);
  if (best) return best;

  const { data: seriesRows } = await supabase
    .from("canonical_covers")
    .select("storage_path, publisher, cover_date")
    .eq("series_title", seriesTitle)
    .not("publisher", "is", null)
    .limit(20);

  const bestFallback = pickBestCoverRow(seriesRows, targetYear);
  return bestFallback ?? { storage_path: null, publisher: null };
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function pickBestCoverRow(rows, targetYear) {
  if (!rows?.length) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const r of rows) {
    if (targetYear == null) {
      if (!best) best = r;
      continue;
    }
    const y = parseYear(r.cover_date);
    if (y == null) {
      if (!best) best = r;
      continue;
    }
    const diff = Math.abs(y - targetYear);
    if (diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }
  return best;
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
      // gcd_id is an integer column — coerce explicitly to avoid implicit
      // string→int casting in Postgres and to reject malformed URLs early.
      const gcdId = Number(String(id).replace(/^gcd-/, ""));
      if (!Number.isInteger(gcdId) || gcdId <= 0) {
        return NextResponse.json({ error: "Invalid GCD id" }, { status: 400 });
      }

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

      const [seriesResult, gcdSeriesResult] = await Promise.all([
        supabase
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
          .eq("gcd_id", issue.series_gcd_id)
          .single(),
        // Series-level publisher per GCD — preferred over per-issue
        // publisher_gcd_id, which is often a distributor or shell company.
        supabase
          .from("gcd_series")
          .select("publisher_gcd_id")
          .eq("gcd_id", issue.series_gcd_id)
          .single(),
      ]);

      const seriesRow = seriesResult.data;
      const seriesLevelPublisherGcdId = gcdSeriesResult.data?.publisher_gcd_id ?? null;

      const publisherIdsToFetch = [
        ...new Set(
          [issue.publisher_gcd_id, seriesLevelPublisherGcdId]
            .filter(Boolean)
            .map((v) => String(v))
        ),
      ];

      let gcdPublisherName = null;
      let seriesLevelPublisherName = null;
      if (publisherIdsToFetch.length > 0) {
        const { data: gcdPublisherRows } = await supabase
          .from("gcd_publishers")
          .select("gcd_id, name")
          .in("gcd_id", publisherIdsToFetch);

        const nameByGcdId = new Map(
          (gcdPublisherRows ?? []).map((row) => [String(row.gcd_id), row.name])
        );
        gcdPublisherName = issue.publisher_gcd_id
          ? nameByGcdId.get(String(issue.publisher_gcd_id)) ?? null
          : null;
        seriesLevelPublisherName = seriesLevelPublisherGcdId
          ? nameByGcdId.get(String(seriesLevelPublisherGcdId)) ?? null
          : null;
      }

      const seriesId = seriesRow?.id ?? null;
      const seriesTitle = seriesRow?.title ?? issue.title ?? null;

      const issueYear = parseYear(issue.publication_date);
      const canonicalMatch = await fetchCanonicalMatch(
        supabase,
        seriesTitle,
        issue.issue_number,
        issueYear
      );

      // Publisher resolution priority (most-trusted → least):
      //   1. Per-issue indicia publisher from gcd_issues (what was physically
      //      printed in this specific book — what the collector cares about)
      //   2. Series-level GCD publisher
      //   3. Publishers-table FK on the canonical series row
      //   4. ComicVine's series-level publisher (often the CURRENT IP owner
      //      rather than the original publisher — wrong for old issues)
      //   5. ComicVine's canonical-covers publisher
      //
      // The old code ranked ComicVine first, which made the 1984 Mirage
      // TMNT #1 read as "IDW Publishing" because IDW currently holds the IP.
      const publisherName = resolvePublisher({
        cv: gcdPublisherName,
        candidates: [
          seriesLevelPublisherName,
          seriesRow?.publisher?.name ?? null,
          seriesRow?.cv_publisher ?? null,
          canonicalMatch.publisher ?? null,
        ],
        seriesTitle,
      });

      const cover = canonicalMatch.storage_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${canonicalMatch.storage_path}`
        : null;

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