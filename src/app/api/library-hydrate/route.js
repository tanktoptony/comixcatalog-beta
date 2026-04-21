import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const comicIds = Array.isArray(body.comic_ids)
      ? body.comic_ids.map(String).filter(Boolean)
      : [];
    const gcdIds = Array.isArray(body.gcd_issue_ids)
      ? body.gcd_issue_ids.map(Number).filter((n) => !Number.isNaN(n))
      : [];

    if (comicIds.length === 0 && gcdIds.length === 0) {
      return NextResponse.json({ items: {} });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const items = {};

    const [localResult, gcdIssuesResult] = await Promise.all([
      comicIds.length > 0
        ? supabase
            .from("comics")
            .select("id, series_title, publisher, issue_number, release_year, comic_covers(image_path, is_primary)")
            .in("id", comicIds)
        : { data: [] },
      gcdIds.length > 0
        ? supabase
            .from("gcd_issues")
            .select("gcd_id, series_gcd_id, publisher_gcd_id, issue_number, publication_date")
            .in("gcd_id", gcdIds)
        : { data: [] },
    ]);

    // ── Local comics ──
    for (const comic of localResult.data ?? []) {
      const coverPath =
        comic.comic_covers?.find((c) => c.is_primary)?.image_path ??
        comic.comic_covers?.[0]?.image_path ??
        null;
      items[String(comic.id)] = {
        libraryKey: String(comic.id),
        href: `/comic/${comic.id}`,
        sourceType: "local",
        id: String(comic.id),
        title: comic.series_title ?? "Untitled",
        issueNumber: comic.issue_number ?? "",
        year: comic.release_year ?? null,
        publisher: comic.publisher ?? null,
        cover: coverPath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${coverPath}`
          : null,
      };
    }

    // ── GCD issues ──
    const issueList = gcdIssuesResult.data ?? [];
    if (issueList.length > 0) {
      const seriesGcdIds = [...new Set(issueList.map((i) => i.series_gcd_id).filter(Boolean))];
      const publisherGcdIds = [...new Set(issueList.map((i) => i.publisher_gcd_id).filter(Boolean))];

      const [seriesResult, publisherResult] = await Promise.all([
        seriesGcdIds.length > 0
          ? supabase
              .from("series")
              .select("gcd_id, title, publisher:publisher_id(name)")
              .in("gcd_id", seriesGcdIds)
          : { data: [] },
        publisherGcdIds.length > 0
          ? supabase
              .from("gcd_publishers")
              .select("gcd_id, name")
              .in("gcd_id", publisherGcdIds)
          : { data: [] },
      ]);

      const seriesLookup = Object.fromEntries(
        (seriesResult.data ?? []).map((r) => [String(r.gcd_id), r])
      );
      const publisherLookup = Object.fromEntries(
        (publisherResult.data ?? []).map((r) => [String(r.gcd_id), r.name])
      );

      const intermediate = issueList.map((issue) => {
        const seriesRow = seriesLookup[String(issue.series_gcd_id)];
        return {
          gcd_id: issue.gcd_id,
          issue_number: issue.issue_number,
          publication_date: issue.publication_date,
          seriesTitle: seriesRow?.title ?? null,
          publisher:
            seriesRow?.publisher?.name ??
            publisherLookup[String(issue.publisher_gcd_id)] ??
            null,
        };
      });

      const seriesTitles = [...new Set(intermediate.map((r) => r.seriesTitle).filter(Boolean))];
      let canonicalLookup = {};

      if (seriesTitles.length > 0) {
        const { data: covers } = await supabase
          .from("canonical_covers")
          .select("series_title, issue_number, storage_path")
          .in("series_title", seriesTitles)
          .not("storage_path", "is", null);

        canonicalLookup = Object.fromEntries(
          (covers ?? []).map((row) => [
            `${norm(row.series_title)}::${norm(row.issue_number)}`,
            row.storage_path,
          ])
        );
      }

      for (const row of intermediate) {
        const coverKey = `${norm(row.seriesTitle)}::${norm(row.issue_number)}`;
        const storagePath = canonicalLookup[coverKey] ?? null;
        const libraryKey = `gcd-${row.gcd_id}`;

        items[libraryKey] = {
          libraryKey,
          href: `/issue/${libraryKey}`,
          sourceType: "gcd",
          id: libraryKey,
          title: row.seriesTitle ?? "Untitled",
          issueNumber: row.issue_number ?? "",
          year: parseYear(row.publication_date),
          publisher: row.publisher ?? null,
          cover: storagePath
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`
            : null,
        };
      }
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("POST /api/library-hydrate crashed:", err);
    return NextResponse.json({ items: {} }, { status: 500 });
  }
}
