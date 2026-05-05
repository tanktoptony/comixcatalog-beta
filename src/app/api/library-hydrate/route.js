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

    // ── Local comics — canonical cover lookup ──
    const localComics = localResult.data ?? [];
    if (localComics.length > 0) {
      const localSeriesTitles = [...new Set(localComics.map((c) => c.series_title).filter(Boolean))];
      const localIssueNumbers = [...new Set(localComics.map((c) => c.issue_number).filter((v) => v != null))];

      const COVER_YEAR_TOLERANCE = 1;
      const localCoversByKey = new Map();

      if (localSeriesTitles.length > 0 && localIssueNumbers.length > 0) {
        const { data: localCovers } = await supabase
          .from("canonical_covers")
          .select("series_title, issue_number, series_year, cover_date, storage_path")
          .in("series_title", localSeriesTitles)
          .in("issue_number", localIssueNumbers)
          .not("storage_path", "is", null);

        for (const c of localCovers ?? []) {
          const key = `${norm(c.series_title)}::${norm(c.issue_number)}`;
          if (!localCoversByKey.has(key)) localCoversByKey.set(key, []);
          localCoversByKey.get(key).push(c);
        }
      }

      for (const comic of localComics) {
        const coverKey = `${norm(comic.series_title)}::${norm(comic.issue_number)}`;
        const issueYear = comic.release_year ?? null;
        const candidates = localCoversByKey.get(coverKey) ?? [];

        let canonicalUrl = null;
        if (candidates.length > 0) {
          const yearOf = (c) => {
            const cd = parseYear(c.cover_date);
            if (cd != null) return cd;
            return c.series_year != null ? Number(c.series_year) : null;
          };
          let best = null;
          let bestDiff = Infinity;
          for (const c of candidates) {
            const cy = yearOf(c);
            if (cy == null) { if (!best) best = c; continue; }
            if (issueYear == null) { best = c; break; }
            const diff = Math.abs(cy - issueYear);
            if (diff > COVER_YEAR_TOLERANCE) continue;
            if (diff < bestDiff) { best = c; bestDiff = diff; }
          }
          if (best) canonicalUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${best.storage_path}`;
        }

        // Fall back to user-uploaded comic_covers if no canonical cover found
        const userCoverPath =
          comic.comic_covers?.find((c) => c.is_primary)?.image_path ??
          comic.comic_covers?.[0]?.image_path ??
          null;
        const userCoverFallback = userCoverPath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${userCoverPath}`
          : null;

        items[String(comic.id)] = {
          libraryKey: String(comic.id),
          href: `/comic/${comic.id}`,
          sourceType: "local",
          id: String(comic.id),
          title: comic.series_title ?? "Untitled",
          issueNumber: comic.issue_number ?? "",
          year: comic.release_year ?? null,
          publisher: comic.publisher ?? null,
          cover: canonicalUrl ?? userCoverFallback,
        };
      }
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
      const issueNumbers = [
        ...new Set(intermediate.map((r) => r.issue_number).filter((v) => v != null)),
      ];

      // Year-aware cover lookup. canonical_covers is indexed by
      // (series_title, issue_number) but those alone aren't enough to
      // disambiguate volumes — Mirage TMNT 1984 #2 and IDW TMNT 2011 #2 are
      // both stored under "Teenage Mutant Ninja Turtles" #2. We pull
      // series_year from canonical_covers and require it to match the issue's
      // publication year (with a small tolerance) before using the cover.
      // No match = no cover; fallback placeholder beats the wrong volume.
      const COVER_YEAR_TOLERANCE = 1;
      const coversByKey = new Map();

      if (seriesTitles.length > 0 && issueNumbers.length > 0) {
        const { data: covers } = await supabase
          .from("canonical_covers")
          .select("series_title, issue_number, series_year, cover_date, storage_path")
          .in("series_title", seriesTitles)
          .in("issue_number", issueNumbers)
          .not("storage_path", "is", null);

        for (const c of covers ?? []) {
          const key = `${norm(c.series_title)}::${norm(c.issue_number)}`;
          if (!coversByKey.has(key)) coversByKey.set(key, []);
          coversByKey.get(key).push(c);
        }
      }

      for (const row of intermediate) {
        const coverKey = `${norm(row.seriesTitle)}::${norm(row.issue_number)}`;
        const issueYear = parseYear(row.publication_date);
        const candidates = coversByKey.get(coverKey) ?? [];

        let storagePath = null;
        if (candidates.length > 0 && issueYear != null) {
          // For a specific issue, cover_date is the authoritative year signal —
          // it's THIS issue's publication date. series_year is when the
          // *series* started, which for long-running annuals (X-Men Annual
          // 1970, issue #3 published 1979) is many years off the actual issue.
          // Only fall back to series_year when cover_date is missing.
          const yearOf = (c) => {
            const cd = parseYear(c.cover_date);
            if (cd != null) return cd;
            return c.series_year != null ? Number(c.series_year) : null;
          };

          let best = null;
          let bestDiff = Infinity;
          for (const c of candidates) {
            const cy = yearOf(c);
            if (cy == null) continue;
            const diff = Math.abs(cy - issueYear);
            if (diff > COVER_YEAR_TOLERANCE) continue;
            if (diff < bestDiff) {
              best = c;
              bestDiff = diff;
            }
          }
          if (best) storagePath = best.storage_path;
        }

        const libraryKey = `gcd-${row.gcd_id}`;

        items[libraryKey] = {
          libraryKey,
          href: `/issue/${libraryKey}`,
          sourceType: "gcd",
          id: libraryKey,
          title: row.seriesTitle ?? "Untitled",
          issueNumber: row.issue_number ?? "",
          year: issueYear,
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
