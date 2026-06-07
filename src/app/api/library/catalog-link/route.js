// /api/library/catalog-link
//
// GET  — return the user's local-only owned rows with their best GCD candidate
//        per row. Each entry is one of:
//          { status: "confident", collection_id, comic, candidate }
//          { status: "ambiguous", collection_id, comic, candidates: [...] }
//          { status: "no_match",  collection_id, comic }
//        Confident means exactly one (series, issue_number) match OR a
//        year-disambiguated single best.
//
// POST — apply a list of links. Body: { user_id, links: [{collection_id, gcd_issue_id}, ...] }
//        For each link: validates ownership, sets gcd_issue_id, nulls comic_id
//        (the schema invariant: a row is either-or, never both). Returns the
//        per-row apply result.
//
// Pro-gated. ADMIN_ID short-circuits. Service-role bypasses Pro grading
// trigger (migration 0008) when we null grade fields back out — which we
// don't, but the service-role write is what makes the path safe regardless.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_ID } from "@/lib/admin";
import {
  normTitle,
  normIssue,
  parseYear,
  bestYearFor,
  titleVariants,
  pickFromMatches,
} from "@/lib/catalogLinkMatcher";


async function assertPro(supabase, user_id) {
  if (user_id === ADMIN_ID) return true;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_pro, is_founding_collector")
    .eq("id", user_id)
    .single();
  return Boolean(profile?.is_pro || profile?.is_founding_collector);
}

// ─────────────────────────────────────────────────────────────────────────
// GET — find candidates
// ─────────────────────────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const isPro = await assertPro(supabase, user_id);
    if (!isPro) {
      return NextResponse.json(
        { error: "Pro tier required", upgrade: true },
        { status: 402 }
      );
    }

    // Fetch only local-only owned rows. Wishlist/for_sale would also benefit
    // from linking, but the user's primary value lives in owned — start there
    // to keep the candidate set small and the audit fast.
    const { data: localRows, error: lrErr } = await supabase
      .from("user_collections")
      .select("id, comic_id")
      .eq("user_id", user_id)
      .eq("status", "owned")
      .is("gcd_issue_id", null)
      .not("comic_id", "is", null);

    if (lrErr) {
      console.error("catalog-link: local row fetch failed:", lrErr);
      return NextResponse.json({ error: "Failed to load collection" }, { status: 500 });
    }

    if (!localRows?.length) {
      return NextResponse.json({
        summary: { total: 0, confident: 0, ambiguous: 0, no_match: 0 },
        entries: [],
      });
    }

    const comicIds = [...new Set(localRows.map((r) => r.comic_id))];
    const { data: comics } = await supabase
      .from("comics")
      .select("id, series_title, issue_number, publisher, release_year")
      .in("id", comicIds);
    const comicById = {};
    for (const c of comics ?? []) comicById[c.id] = c;

    // Build the unique normalized-title set we need to match against. We
    // expand each user title into multiple candidate forms (volume-suffix
    // stripping, & ↔ and swaps, leading "The" toggles, ellipsis normalization)
    // so user-side annotations don't drop matches into the no-match bucket.
    const titleNormSet = new Set();
    const variantsByComicId = new Map();
    for (const c of comics ?? []) {
      const vs = titleVariants(c.series_title);
      variantsByComicId.set(c.id, vs);
      for (const v of vs) titleNormSet.add(v);
    }
    const titleNorms = [...titleNormSet];

    const seriesByNormTitle = new Map();
    if (titleNorms.length > 0) {
      const { data: seriesRows } = await supabase
        .from("series")
        .select("id, gcd_id, title, title_normalized, year_start_cached, year_end_cached, resolved_publisher_cached")
        .in("title_normalized", titleNorms)
        .not("gcd_id", "is", null);
      for (const s of seriesRows ?? []) {
        if (!seriesByNormTitle.has(s.title_normalized)) {
          seriesByNormTitle.set(s.title_normalized, []);
        }
        seriesByNormTitle.get(s.title_normalized).push(s);
      }
    }

    // Now fetch every gcd_issue under any of those series (one batched IN),
    // then bucket by (series_gcd_id, issue_number_norm).
    const allSeriesGcdIds = [];
    for (const arr of seriesByNormTitle.values()) {
      for (const s of arr) allSeriesGcdIds.push(s.gcd_id);
    }
    const issuesBySeriesIssue = new Map();
    if (allSeriesGcdIds.length > 0) {
      // PostgREST silent 1000-row cap — paginate.
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: page } = await supabase
          .from("gcd_issues")
          .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
          .in("series_gcd_id", allSeriesGcdIds)
          .range(from, from + PAGE - 1);
        if (!page?.length) break;
        for (const i of page) {
          const k = `${i.series_gcd_id}::${normIssue(i.issue_number)}`;
          if (!issuesBySeriesIssue.has(k)) issuesBySeriesIssue.set(k, []);
          issuesBySeriesIssue.get(k).push(i);
        }
        if (page.length < PAGE) break;
        from += PAGE;
      }
    }

    const entries = [];
    let confident = 0;
    let ambiguous = 0;
    let noMatch = 0;

    for (const row of localRows) {
      const comic = comicById[row.comic_id];
      if (!comic) {
        entries.push({ status: "no_match", collection_id: row.id, comic: null });
        noMatch += 1;
        continue;
      }
      const variants = variantsByComicId.get(comic.id) ?? [];
      const iNorm = normIssue(comic.issue_number);

      // Collect series across all title variants. Dedup by series.gcd_id —
      // multiple variant forms can map to the same series and we don't want
      // to double-count it as ambiguous.
      const seenSeries = new Set();
      const seriesCandidates = [];
      for (const v of variants) {
        for (const s of (seriesByNormTitle.get(v) ?? [])) {
          if (seenSeries.has(s.gcd_id)) continue;
          seenSeries.add(s.gcd_id);
          seriesCandidates.push(s);
        }
      }

      const matches = [];
      for (const s of seriesCandidates) {
        const issuesForKey = issuesBySeriesIssue.get(`${s.gcd_id}::${iNorm}`) ?? [];
        for (const issue of issuesForKey) {
          matches.push({
            gcd_issue_id: Number(issue.gcd_id),
            series_id: s.id,
            series_gcd_id: s.gcd_id,
            series_title: s.title,
            series_year_start: s.year_start_cached,
            series_year_end: s.year_end_cached,
            publisher: s.resolved_publisher_cached,
            issue_number: issue.issue_number,
            issue_year: bestYearFor(issue),
          });
        }
      }

      const comicSummary = {
        id: comic.id,
        series_title: comic.series_title,
        issue_number: comic.issue_number,
        release_year: comic.release_year,
        publisher: comic.publisher,
      };

      const result = pickFromMatches(matches, comic);
      if (result.status === "no_match") {
        entries.push({ status: "no_match", collection_id: row.id, comic: comicSummary });
        noMatch += 1;
      } else if (result.status === "confident") {
        entries.push({
          status: "confident",
          collection_id: row.id,
          comic: comicSummary,
          candidate: result.picked,
          year_disambiguated: !!result.year_disambiguated,
          base_picked: !!result.base_picked,
        });
        confident += 1;
      } else {
        entries.push({
          status: "ambiguous",
          collection_id: row.id,
          comic: comicSummary,
          candidates: matches.slice(0, 8), // cap UI noise
        });
        ambiguous += 1;
      }
    }

    return NextResponse.json({
      summary: {
        total: localRows.length,
        confident,
        ambiguous,
        no_match: noMatch,
      },
      entries,
    });
  } catch (err) {
    console.error("GET /api/library/catalog-link crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST — apply links
// ─────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, links } = body;
    if (!user_id || !Array.isArray(links) || links.length === 0) {
      return NextResponse.json({ error: "user_id + links[] required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const isPro = await assertPro(supabase, user_id);
    if (!isPro) {
      return NextResponse.json(
        { error: "Pro tier required", upgrade: true },
        { status: 402 }
      );
    }

    // Two-step safety: pull ownership for the collection rows we're about to
    // touch so a malicious client can't pass arbitrary collection_ids belonging
    // to other users. RLS would also catch this, but explicit > implicit.
    const collectionIds = links.map((l) => l.collection_id).filter(Boolean);
    const { data: owned } = await supabase
      .from("user_collections")
      .select("id, user_id, gcd_issue_id, comic_id, user_cover_url")
      .in("id", collectionIds);
    const ownedById = new Map();
    for (const r of owned ?? []) ownedById.set(r.id, r);

    // Photo-preservation: before we null the comic_id, look up any
    // comic_covers row attached to that local comic. If the user uploaded a
    // photo of their copy (which is what comic_covers represents pre-linking)
    // and they don't already have a personal cover on the user_collections
    // row, carry it over. The image lives in the same `comic-covers` bucket
    // so the path is reusable as-is — we just copy the string. Without this,
    // a wood-grain photo of your physical book disappears the second the
    // row gets a gcd_issue_id, even though we still know which book it is.
    const comicIdsToProbe = (owned ?? [])
      .filter((r) => r.comic_id != null && !r.user_cover_url)
      .map((r) => r.comic_id);
    const photoByComicId = new Map();
    if (comicIdsToProbe.length > 0) {
      const { data: covers } = await supabase
        .from("comic_covers")
        .select("comic_id, image_path, is_primary, created_at")
        .in("comic_id", comicIdsToProbe);
      // Prefer is_primary, else oldest (created_at ASC) — first upload tends
      // to be the user's own copy photo.
      const byComic = new Map();
      for (const c of covers ?? []) {
        if (!byComic.has(c.comic_id)) byComic.set(c.comic_id, []);
        byComic.get(c.comic_id).push(c);
      }
      for (const [cid, arr] of byComic.entries()) {
        const primary = arr.find((c) => c.is_primary);
        const chosen = primary ?? arr.sort((a, b) =>
          String(a.created_at).localeCompare(String(b.created_at))
        )[0];
        if (chosen) photoByComicId.set(cid, chosen.image_path);
      }
    }

    let linked = 0;
    let skipped = 0;
    const errors = [];

    for (const { collection_id, gcd_issue_id } of links) {
      const existing = ownedById.get(collection_id);
      if (!existing) {
        skipped += 1;
        errors.push({ collection_id, reason: "not_found" });
        continue;
      }
      if (existing.user_id !== user_id) {
        skipped += 1;
        errors.push({ collection_id, reason: "not_owner" });
        continue;
      }
      if (existing.gcd_issue_id != null) {
        // Already linked — idempotent skip.
        skipped += 1;
        continue;
      }

      // Check for an existing row on the same user_id + target gcd_issue_id.
      // If one exists, REFUSE to link this row — auto-deleting would be data
      // loss any time the user's local titles are genuinely different books
      // mapped to the same GCD entry (e.g. miniseries with the same canonical
      // series but different physical printings). Surface it as a soft skip
      // with a reason the UI can render so the user can resolve manually.
      const { data: collision } = await supabase
        .from("user_collections")
        .select("id")
        .eq("user_id", user_id)
        .eq("gcd_issue_id", gcd_issue_id)
        .maybeSingle();

      if (collision?.id && collision.id !== collection_id) {
        skipped += 1;
        errors.push({
          collection_id,
          reason: "collision",
          message: "Another row already links to this catalog entry — manual review needed",
        });
        continue;
      }

      const personalCover = photoByComicId.get(existing.comic_id) ?? null;
      const updatePayload = { gcd_issue_id, comic_id: null };
      if (personalCover && !existing.user_cover_url) {
        updatePayload.user_cover_url = personalCover;
      }
      const { error: updErr } = await supabase
        .from("user_collections")
        .update(updatePayload)
        .eq("id", collection_id);
      if (updErr) {
        errors.push({ collection_id, reason: "update_failed", message: updErr.message });
        skipped += 1;
        continue;
      }
      linked += 1;
    }

    return NextResponse.json({ linked, skipped, errors });
  } catch (err) {
    console.error("POST /api/library/catalog-link crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
