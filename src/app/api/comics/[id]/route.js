import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolvePublisher } from "@/lib/publisher";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

const COVER_YEAR_DIFF_THRESHOLD = 2;

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
    if (diff > COVER_YEAR_DIFF_THRESHOLD) continue;
    if (diff < bestDiff) {
      best = r;
      bestDiff = diff;
    }
  }
  return best;
}

// GET /api/comics/[id]
export async function GET(req, context) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();

    // Handle GCD issues (prefixed with "gcd-")
    if (String(id).startsWith("gcd-")) {
      // gcd_id is an integer column — coerce explicitly to avoid implicit
      // string→int casting in Postgres and to reject malformed URLs early.
      const gcdId = Number(String(id).replace(/^gcd-/, ""));
      if (!Number.isInteger(gcdId) || gcdId <= 0) {
        return NextResponse.json({ error: "Invalid GCD id" }, { status: 400 });
      }

      const { data: issue, error } = await supabase
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

      if (error || !issue) {
        return NextResponse.json({ error: "Issue not found" }, { status: 404 });
      }

      const [seriesResult, gcdPublisherResult, gcdSeriesResult] = await Promise.all([
        supabase
          .from("series")
          .select("id, title, cv_publisher, publisher:publisher_id(id, name)")
          .eq("gcd_id", issue.series_gcd_id)
          .single(),
        issue.publisher_gcd_id
          ? supabase
              .from("gcd_publishers")
              .select("name")
              .eq("gcd_id", issue.publisher_gcd_id)
              .single()
          : Promise.resolve({ data: null }),
        // Series-level publisher per GCD — preferred over per-issue value,
        // which is often a distributor or shell company.
        supabase
          .from("gcd_series")
          .select("publisher_gcd_id")
          .eq("gcd_id", issue.series_gcd_id)
          .single(),
      ]);

      const seriesRow = seriesResult.data;
      const seriesTitle = seriesRow?.title ?? issue.title ?? null;

      const seriesLevelPublisherGcdId = gcdSeriesResult.data?.publisher_gcd_id ?? null;
      let seriesLevelPublisherName = null;
      if (seriesLevelPublisherGcdId) {
        const { data: gcdPubRow } = await supabase
          .from("gcd_publishers")
          .select("name")
          .eq("gcd_id", seriesLevelPublisherGcdId)
          .single();
        seriesLevelPublisherName = gcdPubRow?.name ?? null;
      }

      let cover = null;
      let canonicalPublisher = null;
      if (seriesTitle && issue.issue_number != null) {
        const { data: canonicalRows } = await supabase
          .from("canonical_covers")
          .select("storage_path, publisher, cover_date")
          .eq("series_title", seriesTitle)
          .eq("issue_number", issue.issue_number);

        const issueYear = parseYear(issue.publication_date);
        const bestRow = pickBestCoverRow(canonicalRows, issueYear);
        if (bestRow?.storage_path) {
          cover = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${bestRow.storage_path}`;
        }
        canonicalPublisher = bestRow?.publisher
          ?? canonicalRows?.find((row) => row.publisher)?.publisher
          ?? null;
      }

      const publisherName = resolvePublisher({
        cv: seriesRow?.cv_publisher ?? canonicalPublisher,
        candidates: [
          seriesRow?.publisher?.name ?? null,
          seriesLevelPublisherName,
          gcdPublisherResult.data?.name ?? null,
        ],
        seriesTitle,
      });

      return NextResponse.json({
        issue: {
          id: `gcd-${issue.gcd_id}`,
          source: "gcd",
          series_id: seriesRow?.id ?? null,
          series_title: seriesTitle,
          issue_number: issue.issue_number,
          release_year: parseYear(issue.publication_date),
          publication_date: issue.publication_date ?? null,
          publisher: publisherName,
          cover,
          created_by: null,
        },
      });
    }

    // Handle user-added comics (UUID)
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
      return NextResponse.json({ error: "Comic not found" }, { status: 404 });
    }

    const coverPath =
      comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null;

    return NextResponse.json({
      issue: {
        id: comic.id,
        source: "user",
        series_title: comic.series_title ?? null,
        issue_number: comic.issue_number ?? null,
        release_year: comic.release_year ?? null,
        publisher: comic.publisher ?? null,
        cover: coverPath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${coverPath}`
          : null,
        created_by: comic.created_by ?? null,
      },
    });
  } catch (err) {
    console.error("GET /api/comics/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/comics/[id]
export async function PATCH(req, context) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();
    const body = await req.json();
    const { series_title, issue_number, publisher, release_year, user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!existing || existing.created_by !== user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("comics")
      .update({
        series_title,
        issue_number,
        publisher,
        release_year: release_year ? Number(release_year) : null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comic: data });
  } catch (err) {
    console.error("PATCH /api/comics/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/comics/[id]
export async function DELETE(req, context) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!existing || existing.created_by !== user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("comics")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/comics/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}