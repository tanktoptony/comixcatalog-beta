import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// publication_date is null on ~65% of gcd_issues rows; key_date (GCD's sortable
// approximation) fills most of that gap. Without this fallback a collector's
// owned issues show "Unknown" year ~⅔ of the time AND lose their cover (the
// year-aware matcher below requires a non-null year).
function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
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
      user_cover_url,
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
      .select("gcd_id, series_gcd_id, publisher_gcd_id, issue_number, publication_date, key_date")
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
            .select("gcd_id, title, resolved_publisher_cached, year_start_cached, year_end_cached, publisher:publisher_id(name)")
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
        year: bestYearFor(issue),
        seriesYearStart: seriesRow?.year_start_cached ?? null,
        seriesYearEnd: seriesRow?.year_end_cached ?? null,
        seriesTitle: seriesRow?.title ?? null,
        // resolved_publisher_cached is the year-aware, audited value — prefer it.
        // The publisher_gcd_id fallback draws on GCD's scrambled publisher links
        // (US Marvel books mislinked to foreign houses), so it's last resort only.
        publisher:
          seriesRow?.resolved_publisher_cached ??
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
    //
    // Two-path: prefer ID-based join (canonical_covers.series_gcd_id, set by
    // migration 0009 backfill + new ingests). Falls back to title-string for
    // legacy rows still NULL. The ID path is immune to mojibake / casing /
    // punctuation drift between CV titles and our series titles.
    const COVER_YEAR_TOLERANCE = 1;
    const coversByIdKey = new Map();
    const coversByKey = new Map();

    // PostgREST silently caps responses at 1000 rows. A user with broad
    // title coverage (Batman + Conan + Spider-Man + …) easily exceeds that
    // — Conan alone returned 1700+ rows — and the truncated set drops
    // specific issues like Conan #183. Always paginate via .range().
    const PAGE = 1000;
    async function fetchAllPages(buildQuery) {
      const all = [];
      let from = 0;
      while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    }

    if (seriesGcdIds.length > 0) {
      const idCovers = await fetchAllPages(() =>
        supabase
          .from("canonical_covers")
          .select("series_gcd_id, issue_number, series_year, cover_date, storage_path")
          .in("series_gcd_id", seriesGcdIds)
          .not("storage_path", "is", null)
          .order("id")
      );
      for (const c of idCovers) {
        const key = `${c.series_gcd_id}::${norm(c.issue_number)}`;
        if (!coversByIdKey.has(key)) coversByIdKey.set(key, []);
        coversByIdKey.get(key).push(c);
      }
    }
    if (seriesTitles.length > 0) {
      const covers = await fetchAllPages(() =>
        supabase
          .from("canonical_covers")
          .select("series_title, issue_number, series_year, cover_date, storage_path")
          .in("series_title", seriesTitles)
          .not("storage_path", "is", null)
          .order("id")
      );
      for (const c of covers) {
        const key = `${norm(c.series_title)}::${norm(c.issue_number)}`;
        if (!coversByKey.has(key)) coversByKey.set(key, []);
        coversByKey.get(key).push(c);
      }
    }

    // cover_date is THIS issue's publication date — it's the authoritative
    // year signal for per-issue matching. series_year is when the series
    // started; for long-running annuals it's many years off this issue's
    // actual year, which would falsely reject correct covers.
    const yearOf = (c) => {
      const cd = parseYear(c.cover_date);
      if (cd != null) return cd;
      return c.series_year != null ? Number(c.series_year) : null;
    };

    // Pick the best storage_path from a candidate pool using year disambiguation.
    // Returns null if no candidate passes tolerance — caller can then try a
    // fallback pool (e.g. title path after ID path comes up empty).
    function pickStoragePath(candidates, issueYear, seriesYearStart, seriesYearEnd) {
      if (!candidates || candidates.length === 0) return null;
      if (issueYear != null) {
        let best = null;
        let bestDiff = Infinity;
        for (const c of candidates) {
          const cy = yearOf(c);
          if (cy == null) continue;
          const diff = Math.abs(cy - issueYear);
          if (diff > COVER_YEAR_TOLERANCE) continue;
          if (diff < bestDiff) { best = c; bestDiff = diff; }
        }
        return best?.storage_path ?? null;
      }
      // No issueYear: use the SERIES's active years as the window. Stops
      // 1985 Transformers issues from grabbing IDW/2025 reboot covers when
      // gcd_issues.publication_date is null. Pick the earliest in-window
      // match.
      if (seriesYearStart != null) {
        const lo = seriesYearStart - COVER_YEAR_TOLERANCE;
        const hi = (seriesYearEnd ?? seriesYearStart + 30) + COVER_YEAR_TOLERANCE;
        let best = null;
        let bestYear = Infinity;
        for (const c of candidates) {
          const cy = yearOf(c);
          if (cy == null) continue;
          if (cy < lo || cy > hi) continue;
          if (cy < bestYear) { best = c; bestYear = cy; }
        }
        if (best) return best.storage_path;
      }
      // Last resort: earliest dated candidate (safer than newest).
      let best = null;
      let bestYear = Infinity;
      for (const c of candidates) {
        const cy = yearOf(c);
        if (cy != null && cy < bestYear) { best = c; bestYear = cy; }
        else if (!best) best = c;
      }
      return best?.storage_path ?? null;
    }

    for (const row of intermediate) {
      const issueRow = issueList.find((i) => i.gcd_id === row.gcd_id);
      const idKey = issueRow?.series_gcd_id
        ? `${issueRow.series_gcd_id}::${norm(row.issue_number)}`
        : null;
      const coverKey = `${norm(row.seriesTitle)}::${norm(row.issue_number)}`;
      const issueYear = row.year;

      // Try ID path first. If it yields no usable path (no candidates OR
      // candidates outside year tolerance), fall back to title path with
      // the series's active year-window as the bound.
      let storagePath = pickStoragePath(
        (idKey && coversByIdKey.get(idKey)) || null,
        issueYear,
        row.seriesYearStart,
        row.seriesYearEnd
      );
      if (!storagePath) {
        storagePath = pickStoragePath(
          coversByKey.get(coverKey) || null,
          issueYear,
          row.seriesYearStart,
          row.seriesYearEnd
        );
      }

      const canonicalUrl = storagePath
        ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${storagePath}`
        : null;
      gcdDisplayLookup[row.gcd_id] = {
        title: row.seriesTitle ?? "Untitled",
        issueNumber: row.issue_number ?? "",
        year: row.year,
        publisher: row.publisher,
        // Legacy single `coverUrl` kept for back-compat (defaults to canonical
        // because GCD-linked rows are catalog-grade by definition). Render
        // sites that care about the canonical-vs-personal distinction should
        // read the three separate fields below.
        coverUrl: canonicalUrl,
        canonicalCoverUrl: canonicalUrl,
        // personalCoverUrl is set per-row later (it's on user_collections, not
        // on the GCD lookup which is shared across users).
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

  // Build URL helpers — cheap, reused per row.
  const personalUrlFromPath = (path) =>
    path ? `${supabaseUrl}/storage/v1/object/public/comic-covers/${path}` : null;

  const normalizedCollection = (collection || [])
    .map((item) => {
      // Personal cover lives on the user_collections row itself and applies
      // equally to GCD-linked and local-only rows. Resolved once per item.
      const personalCoverUrl = personalUrlFromPath(item.user_cover_url);

      if (item.gcd_issue_id != null) {
        const baseDisplay = gcdDisplayLookup[item.gcd_issue_id];
        if (!baseDisplay) return null;
        // Public-profile context: canonical wins for the primary cover; the
        // caller can still surface personalCoverUrl as an overlay/badge if
        // they want to highlight that the owner has a photo of their copy.
        const display = {
          ...baseDisplay,
          personalCoverUrl,
          communityCoverUrl: null,
          // Keep coverUrl pointing at the canonical (already set in the GCD
          // lookup) so existing UI keeps rendering as before.
        };
        return { ...item, display };
      }

      const comic = item.comics;
      if (!comic) return null;

      const coverKey = `${norm(comic.series_title)}::${norm(comic.issue_number)}`;
      const candidates = localCanonicalByKey.get(coverKey) ?? [];
      const issueYear = comic.release_year ?? null;
      const COVER_YEAR_TOLERANCE = 1;

      let canonicalCoverUrl = null;
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
        if (best) canonicalCoverUrl = `${supabaseUrl}/storage/v1/object/public/canonical-covers/${best.storage_path}`;
      }

      // Community cover: comic_covers.image_path — uploaded by some user (often
      // the owner themselves) when adding to /library/add. Treated as the
      // weakest catalog-quality fallback for local-only rows where we have no
      // canonical at all.
      const primaryCover =
        comic.comic_covers?.find((c) => c.is_primary) ||
        comic.comic_covers?.[0];
      const communityCoverUrl = primaryCover
        ? `${supabaseUrl}/storage/v1/object/public/comic-covers/${primaryCover.image_path}`
        : null;

      const display = {
        title: comic.series_title || "Untitled",
        issueNumber: comic.issue_number ?? "",
        year: comic.release_year ?? null,
        publisher: comic.publisher ?? null,
        // Public-profile priority: canonical > community fallback. Personal
        // surfaces as an overlay if the UI wants it.
        coverUrl: canonicalCoverUrl ?? communityCoverUrl,
        canonicalCoverUrl,
        personalCoverUrl,
        communityCoverUrl,
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
