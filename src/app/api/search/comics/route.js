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

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 100), 200));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    if (!q) {
      return NextResponse.json({ comics: [] });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let userRows = [];

    if (offset === 0) {
      const { data: userComics, error: userError } = await supabase
        .from("comics")
        .select(`
          id,
          series_title,
          publisher,
          issue_number,
          release_year,
          variant_name,
          created_by,
          comic_covers (
            image_path,
            is_primary
          )
        `)
        .or(`series_title.ilike.%${q}%,publisher.ilike.%${q}%,issue_number.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (userError) {
        console.error("user comics search failed:", userError);
      } else {
        userRows = (userComics ?? []).map((comic) => ({
          id: comic.id,
          series_title: comic.series_title ?? null,
          publisher: comic.publisher ?? null,
          issue_number: comic.issue_number,
          release_year: comic.release_year,
          variant_name: comic.variant_name,
          created_by: comic.created_by ?? null,
          cover_path:
            comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null,
          __source: "user",
        }));
      }
    }

    const { data: matchedSeries, error: seriesError } = await supabase
      .from("series")
      .select(`
        gcd_id,
        title,
        publisher_id,
        publisher:publisher_id (
          id,
          name,
          gcd_id
        )
      `)
      .ilike("title", `%${q}%`)
      .not("gcd_id", "is", null)
      .limit(400);

    if (seriesError) {
      console.error("series search for comics failed:", seriesError);
      return NextResponse.json({ comics: userRows });
    }

    const seriesGcdIds = [
      ...new Set((matchedSeries ?? []).map((s) => s.gcd_id).filter(Boolean)),
    ];

    if (seriesGcdIds.length === 0) {
      return NextResponse.json({ comics: userRows });
    }

    const { data: gcdIssues, error: gcdError } = await supabase
      .from("gcd_issues")
      .select(`
        gcd_id,
        series_gcd_id,
        publisher_gcd_id,
        issue_number,
        title,
        publication_date
      `)
      .in("series_gcd_id", seriesGcdIds)
      .order("gcd_id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (gcdError) {
      console.error("gcd issue search failed:", gcdError);
      return NextResponse.json({ comics: userRows });
    }

    const publisherGcdIds = [
      ...new Set((gcdIssues ?? []).map((i) => i.publisher_gcd_id).filter(Boolean)),
    ];

    let gcdPublisherLookup = {};
    if (publisherGcdIds.length > 0) {
      const { data: gcdPublisherRows, error: gcdPublisherError } = await supabase
        .from("gcd_publishers")
        .select("gcd_id, name")
        .in("gcd_id", publisherGcdIds);

      if (gcdPublisherError) {
        console.error("gcd publisher lookup failed:", gcdPublisherError);
      } else {
        gcdPublisherLookup = Object.fromEntries(
          (gcdPublisherRows ?? []).map((row) => [String(row.gcd_id), row.name])
        );
      }
    }

    const seriesLookup = Object.fromEntries(
      (matchedSeries ?? []).map((s) => [
        String(s.gcd_id),
        {
          title: s.title ?? null,
          publisher:
            s.publisher?.name ??
            (s.publisher?.gcd_id
              ? gcdPublisherLookup[String(s.publisher.gcd_id)] ?? null
              : null),
        },
      ])
    );

    const gcdRowsBase = (gcdIssues ?? []).map((issue) => ({
      id: `gcd-${issue.gcd_id}`,
      series_title:
        seriesLookup[String(issue.series_gcd_id)]?.title ??
        issue.title ??
        null,
      publisher:
        seriesLookup[String(issue.series_gcd_id)]?.publisher ??
        gcdPublisherLookup[String(issue.publisher_gcd_id)] ??
        null,
      issue_number: issue.issue_number,
      release_year: parseYear(issue.publication_date),
      variant_name: null,
      created_by: null,
      __source: "gcd",
    }));

    const seriesTitles = [
      ...new Set(gcdRowsBase.map((row) => row.series_title).filter(Boolean)),
    ];

    let canonicalRows = [];
    if (seriesTitles.length > 0) {
      const { data, error } = await supabase
        .from("canonical_covers")
        .select("series_title, issue_number, storage_path")
        .in("series_title", seriesTitles)
        .not("storage_path", "is", null);

      if (error) {
        console.error("canonical cover lookup failed:", error);
      } else {
        canonicalRows = data ?? [];
      }
    }

    const canonicalLookup = Object.fromEntries(
      canonicalRows.map((row) => [
        `${normalizeSeriesTitle(row.series_title)}::${normalizeIssueNumber(row.issue_number)}`,
        row.storage_path,
      ])
    );

    const gcdRows = gcdRowsBase.map((row) => {
      const key = `${normalizeSeriesTitle(row.series_title)}::${normalizeIssueNumber(row.issue_number)}`;
      const storagePath = canonicalLookup[key] ?? null;

      return {
        ...row,
        cover_path: storagePath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`
          : null,
      };
    });

    return NextResponse.json({
      comics: [...userRows, ...gcdRows],
    });
  } catch (err) {
    console.error("GET /api/search/comics crashed:", err);
    return NextResponse.json({ comics: [] });
  }
}