import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMarketValuesBulk } from "@/lib/marketValue";

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// publication_date is null on ~65% of gcd_issues rows; key_date (GCD's sortable
// approximation) fills most of that gap. Without this fallback a library item
// shows "Unknown" year ~⅔ of the time AND loses its cover (the year-aware
// matcher below requires a non-null year).
function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
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
    // Optional payload for Phase 2 valuation. Each entry is one user_collections
    // row's grade signal; we use it to bulk-query market_comps via getMarketValue.
    // Shape: [{ collection_id, gcd_issue_id, grade_numeric, slab_company, condition }]
    // Backward-compatible — callers that don't pass this just don't get prices.
    const collectionGrades = Array.isArray(body.collection_grades)
      ? body.collection_grades.filter((g) => g && g.collection_id)
      : [];

    if (comicIds.length === 0 && gcdIds.length === 0) {
      return NextResponse.json({ items: {}, market_values: {} });
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
            .select("gcd_id, series_gcd_id, publisher_gcd_id, issue_number, publication_date, key_date")
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

        // Community cover (comic_covers.image_path) — UGC contribution. Kept
        // as a separate field so render sites can decide whether to use it
        // (e.g. library = yes as last fallback; catalog views = no).
        const userCoverPath =
          comic.comic_covers?.find((c) => c.is_primary)?.image_path ??
          comic.comic_covers?.[0]?.image_path ??
          null;
        const communityCover = userCoverPath
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
          // Legacy single field — picks canonical, falls back to community so
          // existing render code keeps working.
          cover: canonicalUrl ?? communityCover,
          canonicalCover: canonicalUrl,
          communityCover,
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
              .select("gcd_id, title, resolved_publisher_cached, publisher:publisher_id(name)")
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
          key_date: issue.key_date,
          seriesGcdId: issue.series_gcd_id ?? null,
          seriesTitle: seriesRow?.title ?? null,
          // resolved_publisher_cached is the year-aware, audited value — prefer
          // it. The publisher_gcd_id fallback draws on GCD's scrambled publisher
          // links (US Marvel books mislinked to foreign houses), so it's last
          // resort only.
          publisher:
            seriesRow?.resolved_publisher_cached ??
            seriesRow?.publisher?.name ??
            publisherLookup[String(issue.publisher_gcd_id)] ??
            null,
        };
      });

      const seriesTitles = [...new Set(intermediate.map((r) => r.seriesTitle).filter(Boolean))];
      const issueNumbers = [
        ...new Set(intermediate.map((r) => r.issue_number).filter((v) => v != null)),
      ];

      // Year-aware cover lookup. Two-path strategy:
      //
      //   1. ID-based (preferred): join canonical_covers.series_gcd_id ==
      //      gcd_issues.series_gcd_id. Survives mojibake, curly quotes,
      //      slash-spacing, and any other title-string fragility. New covers
      //      and backfilled ones use this path.
      //
      //   2. Title-based (fallback): the legacy join on series_title for
      //      canonical_covers rows where series_gcd_id is still NULL — until
      //      backfill is fully run. Capped to series_gcd_id IS NULL so we
      //      don't double-fetch.
      //
      // Both maps key on the same `(seriesGcdId|normTitle)::issue_number`
      // shape so the per-row resolver below treats them uniformly.
      const COVER_YEAR_TOLERANCE = 1;
      const coversById = new Map();
      const coversByTitle = new Map();

      const intermediateGcdIds = [
        ...new Set(intermediate.map((r) => r.seriesGcdId).filter((v) => v != null)),
      ];

      // ID-first lookup. If migration 0009 hasn't been applied yet, this
      // query errors with "column does not exist" — we swallow that quietly
      // and let the title-based fallback do the work. Once the migration
      // lands and backfill runs, this becomes the primary path for everyone.
      if (intermediateGcdIds.length > 0 && issueNumbers.length > 0) {
        const { data: covers, error } = await supabase
          .from("canonical_covers")
          .select("series_gcd_id, series_title, issue_number, series_year, cover_date, storage_path")
          .in("series_gcd_id", intermediateGcdIds)
          .in("issue_number", issueNumbers)
          .not("storage_path", "is", null);

        if (!error) {
          for (const c of covers ?? []) {
            const key = `${c.series_gcd_id}::${norm(c.issue_number)}`;
            if (!coversById.has(key)) coversById.set(key, []);
            coversById.get(key).push(c);
          }
        }
        // error path: column missing pre-migration, or transient PG hiccup.
        // Either way the title fallback below handles it.
      }

      // Title-string lookup. Used unconditionally as the fallback. We do NOT
      // filter by `series_gcd_id IS NULL` here — that would require the
      // column to exist (breaking on un-migrated prod) and also locks the
      // hydration to the migration order. Letting this return everything
      // is harmless because the per-row resolver below prefers the
      // coversById map first; the title map only fills gaps.
      if (seriesTitles.length > 0 && issueNumbers.length > 0) {
        const { data: covers } = await supabase
          .from("canonical_covers")
          .select("series_title, issue_number, series_year, cover_date, storage_path")
          .in("series_title", seriesTitles)
          .in("issue_number", issueNumbers)
          .not("storage_path", "is", null);

        for (const c of covers ?? []) {
          const key = `${norm(c.series_title)}::${norm(c.issue_number)}`;
          if (!coversByTitle.has(key)) coversByTitle.set(key, []);
          coversByTitle.get(key).push(c);
        }
      }

      for (const row of intermediate) {
        const issueYear = bestYearFor(row);
        // Prefer ID-keyed lookup; fall back to title-keyed only when the
        // ID path returns nothing (or the row has no series_gcd_id at all).
        const idKey =
          row.seriesGcdId != null
            ? `${row.seriesGcdId}::${norm(row.issue_number)}`
            : null;
        const titleKey = `${norm(row.seriesTitle)}::${norm(row.issue_number)}`;
        const candidates =
          (idKey && coversById.get(idKey)) ||
          coversByTitle.get(titleKey) ||
          [];

        let storagePath = null;
        if (candidates.length > 0) {
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

          if (issueYear != null) {
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
          } else {
            // gcd_issues has no publication_date AND no key_date — happens on
            // freshly-cataloged current releases. Fall back to the most
            // recent dated candidate rather than dropping the cover.
            let best = null;
            let bestYear = -Infinity;
            for (const c of candidates) {
              const cy = yearOf(c);
              if (cy != null && cy > bestYear) {
                best = c;
                bestYear = cy;
              } else if (!best) {
                best = c;
              }
            }
            if (best) storagePath = best.storage_path;
          }
        }

        const libraryKey = `gcd-${row.gcd_id}`;
        const canonicalCover = storagePath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`
          : null;

        items[libraryKey] = {
          libraryKey,
          href: `/issue/${libraryKey}`,
          sourceType: "gcd",
          id: libraryKey,
          title: row.seriesTitle ?? "Untitled",
          issueNumber: row.issue_number ?? "",
          year: issueYear,
          publisher: row.publisher ?? null,
          cover: canonicalCover,
          canonicalCover,
          communityCover: null, // GCD-linked rows don't have community covers
        };
      }
    }

    // ── Phase 2 auto-valuation ──
    // For each collection item the caller passed grade signal for, query
    // market_comps and return median + sample size keyed by collection_id.
    // With zero comps in the DB (initial state), every entry returns
    // {value: null, sample_size: 0} — the UI then renders nothing extra.
    const marketValues = {};
    if (collectionGrades.length > 0) {
      const valueMap = await getMarketValuesBulk({
        supabase,
        items: collectionGrades.map((g) => ({
          collection_id: g.collection_id,
          gcd_issue_id: g.gcd_issue_id,
          grade_numeric: g.grade_numeric,
          slab_company: g.slab_company,
          condition: g.condition,
        })),
      });
      for (const [collectionId, result] of valueMap) {
        marketValues[collectionId] = result;
      }
    }

    return NextResponse.json({ items, market_values: marketValues });
  } catch (err) {
    console.error("POST /api/library-hydrate crashed:", err);
    return NextResponse.json({ items: {}, market_values: {} }, { status: 500 });
  }
}
