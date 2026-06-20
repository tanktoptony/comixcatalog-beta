import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolvePublisher } from "@/lib/publisher";

// Volume-disambiguation tolerance. canonical_covers is keyed only by
// (series_title, issue_number), so "Teenage Mutant Ninja Turtles" #2 exists
// for both the 1984 Mirage volume and the 2011 IDW volume. We reject any cover
// whose series_year (the year ITS volume began) falls outside this issue's
// series year span — the same guard /api/series/[id] applies — so an old issue
// can't pick up a modern-reboot cover. Covers with a null series_year are kept
// (can't disambiguate) and left to pickBestCoverRow's year ranking.
const COVER_YEAR_TOLERANCE = 1;

function inSeriesSpan(row, seriesYearMin, seriesYearMax) {
  if (seriesYearMin == null || seriesYearMax == null) return true;
  if (row.series_year == null) return true;
  const sy = Number(row.series_year);
  return (
    sy >= seriesYearMin - COVER_YEAR_TOLERANCE &&
    sy <= seriesYearMax + COVER_YEAR_TOLERANCE
  );
}

async function fetchCanonicalMatch(
  supabase,
  seriesTitle,
  issueNumber,
  targetYear,
  seriesYearMin = null,
  seriesYearMax = null,
  seriesGcdId = null
) {
  // ID path first: covers tagged with this gcd_series win every time, even
  // when CV's series_title differs from GCD's (e.g. CV "The Maxx" vs GCD
  // "The Maxx Trade Paperback"). Falls through to title path when the cc
  // row hasn't been tagged yet.
  if (seriesGcdId) {
    const { data: idRows } = await supabase
      .from("canonical_covers")
      .select("storage_path, publisher, cover_date, series_year")
      .eq("series_gcd_id", seriesGcdId)
      .eq("issue_number", issueNumber);
    const idInSpan = (idRows ?? []).filter((r) =>
      inSeriesSpan(r, seriesYearMin, seriesYearMax)
    );
    const bestById = pickBestCoverRow(idInSpan, targetYear);
    if (bestById) return bestById;
  }

  if (!seriesTitle) return { storage_path: null, publisher: null };

  const { data: exactRows } = await supabase
    .from("canonical_covers")
    .select("storage_path, publisher, cover_date, series_year")
    .eq("series_title", seriesTitle)
    .eq("issue_number", issueNumber);

  const exactInSpan = (exactRows ?? []).filter((r) =>
    inSeriesSpan(r, seriesYearMin, seriesYearMax)
  );
  const best = pickBestCoverRow(exactInSpan, targetYear);
  if (best) return best;

  // Fallback: no in-span cover for this exact issue number, so borrow a
  // representative cover from the same volume (still span-gated — a wrong-era
  // reboot cover is worse than the placeholder).
  const { data: seriesRows } = await supabase
    .from("canonical_covers")
    .select("storage_path, publisher, cover_date, series_year")
    .eq("series_title", seriesTitle)
    .not("publisher", "is", null)
    .limit(40);

  const fallbackInSpan = (seriesRows ?? []).filter((r) =>
    inSeriesSpan(r, seriesYearMin, seriesYearMax)
  );
  const bestFallback = pickBestCoverRow(fallbackInSpan, targetYear);
  return bestFallback ?? { storage_path: null, publisher: null };
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// publication_date is null on ~65% of gcd_issues. key_date is GCD's sortable
// approximation that's populated far more reliably — fall back to it so the
// issue's year (and the year-aware cover match) resolve instead of going blank.
function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Build a clean English "Month YYYY" (or just "YYYY") display string from
// key_date. Avoids GCD's raw publication_date, which carries the original
// indicia language ("septembre 2008" on Civil War #1 — French cover) and
// rendered verbatim used to leak that into the UI. key_date is consistently
// YYYY-MM-DD with -00 for unknown month/day, so it's the right source.
function formatDisplayDate(row) {
  const keyDate = String(row?.key_date ?? "");
  const m = keyDate.match(/^(\d{4})-(\d{2})/);
  if (m) {
    const year = Number(m[1]);
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx >= 0 && monthIdx <= 11) {
      return `${MONTH_NAMES[monthIdx]} ${year}`;
    }
    return String(year);
  }
  // No usable key_date — emit just the year if we can derive one at all.
  const year = bestYearFor(row);
  return year != null ? String(year) : null;
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
    // Optional viewer id, used to compute per-arc ownership for the "Part of
    // [Arc Name] — you own X of Y" badge surfaced below.
    const { searchParams } = new URL(req.url);
    const viewerId = searchParams.get("user_id") || null;

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
          publication_date,
          key_date
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
            resolved_publisher_cached,
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

      // Pull the full series issue list up front. One fetch serves two needs:
      // the volume's year span (to span-gate the cover match below, preventing
      // cross-volume bleed) and the prev/next/related navigation further down.
      let seriesIssuesMapped = [];
      let seriesYearMin = null;
      let seriesYearMax = null;
      if (issue.series_gcd_id) {
        const { data: allIssues } = await supabase
          .from("gcd_issues")
          .select(`
            gcd_id,
            issue_number,
            title,
            publication_date,
            key_date
          `)
          .eq("series_gcd_id", issue.series_gcd_id)
          .order("gcd_id", { ascending: true })
          .limit(500);

        const mappedRaw = (allIssues ?? []).map((row) => ({
          id: `gcd-${row.gcd_id}`,
          issue_number: row.issue_number,
          title: row.title ?? null,
          release_year: bestYearFor(row),
        }));

        seriesIssuesMapped = dedupeSeriesIssueRows(mappedRaw).sort(
          (a, b) => issueSortValue(a.issue_number) - issueSortValue(b.issue_number)
        );

        const spanYears = mappedRaw
          .map((row) => row.release_year)
          .filter((y) => y != null);
        seriesYearMin = spanYears.length ? Math.min(...spanYears) : null;
        seriesYearMax = spanYears.length ? Math.max(...spanYears) : null;
      }

      const issueYear = bestYearFor(issue);
      const canonicalMatch = await fetchCanonicalMatch(
        supabase,
        seriesTitle,
        issue.issue_number,
        issueYear,
        seriesYearMin,
        seriesYearMax,
        issue.series_gcd_id
      );

      // Prefer the precomputed cached value — same posture as the series route
      // (/api/series/[id]). It went through the year-aware audit pipeline, so
      // the issue page and the series page agree on the publisher instead of
      // diverging when a collector clicks through. Only re-resolve when the
      // cache is null.
      //
      // Re-resolution priority (most-trusted → least):
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
      const publisherName =
        seriesRow?.resolved_publisher_cached ||
        resolvePublisher({
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

      if (seriesIssuesMapped.length > 0) {
        const mapped = seriesIssuesMapped;
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

      // ── Story-arc enrichment ─────────────────────────────────────────
      // Which arcs is THIS issue part of? Then for each, fetch the arc's
      // total issue count and (if a viewer is signed in) how many they own.
      // The result powers the "Part of X-Cutioner's Song — you own 1 of 14"
      // badge on the issue page, with a click-through to /arc/<id>.
      let arcs = [];
      const { data: arcMemberships } = await supabase
        .from("story_arc_issues")
        .select("story_arc_id")
        .eq("gcd_issue_id", gcdId);

      const arcIds = [...new Set((arcMemberships ?? []).map((r) => r.story_arc_id))];
      if (arcIds.length > 0) {
        // Arc metadata
        const { data: arcRows } = await supabase
          .from("story_arcs")
          .select("id, cv_id, name, image_url")
          .in("id", arcIds);

        // All issues across these arcs — we need them both for the total
        // count (matchable to our catalog) and for the viewer's owned count.
        const { data: allArcIssues } = await supabase
          .from("story_arc_issues")
          .select("story_arc_id, gcd_issue_id")
          .in("story_arc_id", arcIds);

        // Ownership lookup. Only Pro/Pro-equivalent users should see counts
        // long-term (TBD); for MVP we surface ownership to any signed-in
        // viewer to validate the feature end-to-end.
        const ownedByArc = new Map();
        if (viewerId && allArcIssues?.length) {
          const arcGcdIds = [
            ...new Set(allArcIssues.map((r) => r.gcd_issue_id).filter(Boolean)),
          ];
          if (arcGcdIds.length > 0) {
            const { data: ownedRows } = await supabase
              .from("user_collections")
              .select("gcd_issue_id")
              .eq("user_id", viewerId)
              .eq("status", "owned")
              .in("gcd_issue_id", arcGcdIds);
            const ownedSet = new Set(
              (ownedRows ?? []).map((r) => Number(r.gcd_issue_id))
            );
            for (const r of allArcIssues) {
              if (r.gcd_issue_id == null) continue;
              if (!ownedSet.has(Number(r.gcd_issue_id))) continue;
              ownedByArc.set(r.story_arc_id, (ownedByArc.get(r.story_arc_id) ?? 0) + 1);
            }
          }
        }

        // Total count per arc — restricted to matchable issues (gcd_issue_id
        // not null) so the denominator is honest about what we can actually
        // verify ownership for.
        const matchableByArc = new Map();
        for (const r of allArcIssues ?? []) {
          if (r.gcd_issue_id == null) continue;
          matchableByArc.set(r.story_arc_id, (matchableByArc.get(r.story_arc_id) ?? 0) + 1);
        }

        arcs = (arcRows ?? []).map((a) => ({
          id: a.id,
          cv_id: a.cv_id,
          name: a.name,
          image_url: a.image_url,
          total: matchableByArc.get(a.id) ?? 0,
          owned: ownedByArc.get(a.id) ?? 0,
          href: `/arc/cv-${a.cv_id}`,
        }));
      }

      return NextResponse.json({
        issue: {
          id: `gcd-${issue.gcd_id}`,
          source: "gcd",
          series_id: seriesId,
          series_title: seriesTitle,
          issue_number: issue.issue_number,
          release_year: bestYearFor(issue),
          publication_date: issue.publication_date ?? null,
          display_date: formatDisplayDate(issue),
          publisher: publisherName,
          cover,
          created_by: null,
          prev_issue: prevIssue,
          next_issue: nextIssue,
          related_issues: relatedIssues,
          arcs,
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
        display_date: comic.release_year ? String(comic.release_year) : null,
        publisher: comic.publisher ?? null,
        cover: userCoverPath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${userCoverPath}`
          : null,
        created_by: comic.created_by ?? null,
        prev_issue: null,
        next_issue: null,
        related_issues: [],
        arcs: [],
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