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

export async function GET(req) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const viewerId = searchParams.get("viewer_id") || null;

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, username, is_public, avatar_key, avatar_url, is_founding_collector, is_pro, created_at, display_name, location, bio, website_url, show_collection, show_wantlist, show_for_sale, show_value"
    )
    .eq("username", username)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = viewerId && viewerId === profile.id;

  // Non-owners are blocked from non-public profiles entirely.
  if (!isOwner && !profile.is_public) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Per-section privacy. Owners see everything regardless.
  const visibility = {
    collection: isOwner || profile.show_collection !== false,
    wantlist: isOwner || profile.show_wantlist !== false,
    for_sale: isOwner || profile.show_for_sale !== false,
    value: isOwner || profile.show_value !== false,
  };

  const { data: collection, error: collectionError } = await supabase
    .from("user_collections")
    .select(`
      id,
      status,
      condition,
      grade_numeric,
      slab_company,
      slab_cert_number,
      notes,
      purchase_price,
      market_value,
      created_at,
      comic_id,
      gcd_issue_id,
      comics!user_collections_comic_id_fkey (
        id,
        issue_number,
        release_year,
        series_title,
        publisher,
        comic_covers ( image_path, is_primary )
      )
    `)
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  if (collectionError) {
    return NextResponse.json(
      { error: "Failed to load collection" },
      { status: 500 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const gcdIds = [
    ...new Set(
      (collection || [])
        .map((c) => c.gcd_issue_id)
        .filter((v) => v != null)
    ),
  ];

  const gcdDisplayLookup = {};

  if (gcdIds.length > 0) {
    const { data: issues } = await supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, publisher_gcd_id, issue_number, publication_date")
      .in("gcd_id", gcdIds);

    const issueList = issues || [];

    const seriesGcdIds = [
      ...new Set(issueList.map((i) => i.series_gcd_id).filter(Boolean)),
    ];
    const publisherGcdIds = [
      ...new Set(issueList.map((i) => i.publisher_gcd_id).filter(Boolean)),
    ];

    const [seriesResult, publisherResult] = await Promise.all([
      seriesGcdIds.length > 0
        ? supabase
            .from("series")
            .select("gcd_id, title, publisher:publisher_id(name)")
            .in("gcd_id", seriesGcdIds)
        : Promise.resolve({ data: [] }),
      publisherGcdIds.length > 0
        ? supabase
            .from("gcd_publishers")
            .select("gcd_id, name")
            .in("gcd_id", publisherGcdIds)
        : Promise.resolve({ data: [] }),
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
        year: parseYear(issue.publication_date),
        seriesTitle: seriesRow?.title ?? null,
        publisher:
          seriesRow?.publisher?.name ??
          publisherLookup[String(issue.publisher_gcd_id)] ??
          null,
      };
    });

    const seriesTitles = [
      ...new Set(intermediate.map((r) => r.seriesTitle).filter(Boolean)),
    ];

    // Year-aware cover lookup — same disambiguation as /api/library-hydrate.
    // Without it, multiple volumes of the same series_title share covers and
    // a 2011 IDW TMNT issue ends up with a 1984 Mirage cover.
    const COVER_YEAR_TOLERANCE = 1;
    const coversByKey = new Map();
    if (seriesTitles.length > 0) {
      const { data: covers } = await supabase
        .from("canonical_covers")
        .select("series_title, issue_number, series_year, cover_date, storage_path")
        .in("series_title", seriesTitles)
        .not("storage_path", "is", null);

      for (const c of covers ?? []) {
        const key = `${norm(c.series_title)}::${norm(c.issue_number)}`;
        if (!coversByKey.has(key)) coversByKey.set(key, []);
        coversByKey.get(key).push(c);
      }
    }

    for (const row of intermediate) {
      const coverKey = `${norm(row.seriesTitle)}::${norm(row.issue_number)}`;
      const candidates = coversByKey.get(coverKey) ?? [];
      const issueYear = row.year;

      let storagePath = null;
      if (candidates.length > 0 && issueYear != null) {
        // cover_date is THIS issue's publication date — it's the authoritative
        // year signal for per-issue matching. series_year is when the series
        // started; for long-running annuals it's many years off this issue's
        // actual year, which would falsely reject correct covers.
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

      gcdDisplayLookup[row.gcd_id] = {
        title: row.seriesTitle ?? "Untitled",
        issueNumber: row.issue_number ?? "",
        year: row.year,
        publisher: row.publisher,
        coverUrl: storagePath
          ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${storagePath}`
          : null,
        href: `/issue/gcd-${row.gcd_id}`,
        sourceType: "gcd",
      };
    }
  }

  // Canonical cover lookup for local comics
  const localItems = (collection || []).filter((i) => i.gcd_issue_id == null && i.comics);
  const localSeriesTitles = [...new Set(localItems.map((i) => i.comics?.series_title).filter(Boolean))];
  const localIssueNumbers = [...new Set(localItems.map((i) => i.comics?.issue_number).filter((v) => v != null))];
  const localCanonicalByKey = new Map();

  if (localSeriesTitles.length > 0 && localIssueNumbers.length > 0) {
    const { data: localCovers } = await supabase
      .from("canonical_covers")
      .select("series_title, issue_number, series_year, cover_date, storage_path")
      .in("series_title", localSeriesTitles)
      .in("issue_number", localIssueNumbers)
      .not("storage_path", "is", null);

    for (const c of localCovers ?? []) {
      const key = `${norm(c.series_title)}::${norm(c.issue_number)}`;
      if (!localCanonicalByKey.has(key)) localCanonicalByKey.set(key, []);
      localCanonicalByKey.get(key).push(c);
    }
  }

  const normalizedCollection = (collection || [])
    .map((item) => {
      if (item.gcd_issue_id != null) {
        const display = gcdDisplayLookup[item.gcd_issue_id];
        if (!display) return null;
        return { ...item, display };
      }

      const comic = item.comics;
      if (!comic) return null;

      const coverKey = `${norm(comic.series_title)}::${norm(comic.issue_number)}`;
      const candidates = localCanonicalByKey.get(coverKey) ?? [];
      const issueYear = comic.release_year ?? null;
      const COVER_YEAR_TOLERANCE = 1;

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
        if (best) canonicalUrl = `${supabaseUrl}/storage/v1/object/public/canonical-covers/${best.storage_path}`;
      }

      const primaryCover =
        comic.comic_covers?.find((c) => c.is_primary) ||
        comic.comic_covers?.[0];
      const userCoverFallback = primaryCover
        ? `${supabaseUrl}/storage/v1/object/public/comic-covers/${primaryCover.image_path}`
        : null;

      const display = {
        title: comic.series_title || "Untitled",
        issueNumber: comic.issue_number ?? "",
        year: comic.release_year ?? null,
        publisher: comic.publisher ?? null,
        coverUrl: canonicalUrl ?? userCoverFallback,
        href: `/comic/${comic.id}`,
        sourceType: "local",
      };

      return { ...item, display };
    })
    .filter(Boolean);

  // Apply per-section privacy. Owners see everything. Non-owners get items
  // filtered by status, and value fields zeroed out if show_value is off.
  const visibleCollection = normalizedCollection
    .filter((item) => {
      if (item.status === "owned" && !visibility.collection) return false;
      if (item.status === "wishlist" && !visibility.wantlist) return false;
      if (item.status === "for_sale" && !visibility.for_sale) return false;
      return true;
    })
    .map((item) => {
      if (visibility.value) return item;
      return { ...item, market_value: null, purchase_price: null };
    });

  const publisherCounts = {};
  visibleCollection.forEach((item) => {
    const pub = item.display?.publisher;
    if (!pub) return;
    publisherCounts[pub] = (publisherCounts[pub] || 0) + 1;
  });

  const dominantPublisher =
    Object.entries(publisherCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return NextResponse.json({
    profile,
    visibility,
    collection: visibleCollection,
    dominantPublisher,
  });
}
