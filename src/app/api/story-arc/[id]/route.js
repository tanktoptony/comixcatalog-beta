// GET /api/story-arc/[id]
//
// Returns a story arc, its issue list (ordered), and ownership flags for the
// viewing user when a `?user_id=` is supplied. Powers /arc/[id] and any
// future "this issue is part of [Arc Name] — you own X of Y" badge.
//
// The `id` param accepts either:
//   - the canonical UUID from story_arcs.id
//   - "cv-<cv_id>" pointing at story_arcs.cv_id
//
// Cover resolution uses the same canonical_covers (series_title, issue_number)
// match the rest of the read path uses, with year-aware best-cover selection
// so a 2020 reprint cover doesn't end up on a 1992 issue.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/authServer";

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function pickBestCover(candidates, targetYear) {
  if (!candidates?.length) return null;
  // Tolerance ~1 year — same as the series detail route. We let null-year
  // candidates win only when no dated alternative exists.
  let best = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    if (!c.storage_path) continue;
    const cy = parseYear(c.cover_date) ?? (c.series_year != null ? Number(c.series_year) : null);
    if (cy == null) { if (!best) best = c; continue; }
    if (targetYear == null) { if (!best) best = c; continue; }
    const diff = Math.abs(cy - targetYear);
    if (diff < bestDiff) { best = c; bestDiff = diff; }
  }
  return best?.storage_path ?? null;
}

export async function GET(req, context) {
  try {
    const { id } = await context.params;
    // Optional auth — anonymous visitors can still view the arc page, they
    // just don't get ownership badges. A spoofable query param would let
    // anyone see whether an arbitrary victim owns a given issue.
    const authedViewer = await getAuthedUser(req);
    const viewerId = authedViewer?.id ?? null;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ── Resolve arc by UUID or cv-<id> ────────────────────────────────────
    const cvMatch = String(id).match(/^cv-(\d+)$/);
    const arcQuery = cvMatch
      ? supabase.from("story_arcs").select("*").eq("cv_id", Number(cvMatch[1]))
      : supabase.from("story_arcs").select("*").eq("id", id);
    const { data: arc, error: arcErr } = await arcQuery.maybeSingle();
    if (arcErr || !arc) {
      return NextResponse.json({ error: "Arc not found" }, { status: 404 });
    }

    // ── Pull this arc's issue list ────────────────────────────────────────
    const { data: arcIssues, error: aiErr } = await supabase
      .from("story_arc_issues")
      .select("cv_issue_id, cv_issue_name, cv_site_url, gcd_issue_id, series_title, issue_number, sort_order")
      .eq("story_arc_id", arc.id)
      .order("sort_order", { ascending: true });
    if (aiErr) {
      console.error("story arc issues fetch failed:", aiErr);
      return NextResponse.json({ error: "Failed to load arc issues" }, { status: 500 });
    }

    const issues = arcIssues ?? [];

    // ── Year hints from gcd_issues for cover year-matching ────────────────
    const gcdIds = issues.map((i) => i.gcd_issue_id).filter((v) => v != null);
    const yearByGcdId = new Map();
    if (gcdIds.length > 0) {
      const { data: gcdRows } = await supabase
        .from("gcd_issues")
        .select("gcd_id, publication_date, key_date")
        .in("gcd_id", gcdIds);
      for (const r of gcdRows ?? []) {
        const y = parseYear(r.publication_date) ?? parseYear(r.key_date);
        yearByGcdId.set(r.gcd_id, y);
      }
    }

    // ── Cover lookup (one batch) ──────────────────────────────────────────
    const seriesTitles = [...new Set(issues.map((i) => i.series_title).filter(Boolean))];
    const issueNumbers = [...new Set(issues.map((i) => i.issue_number).filter((v) => v != null))];
    const coversByKey = new Map();
    if (seriesTitles.length > 0 && issueNumbers.length > 0) {
      const { data: covers } = await supabase
        .from("canonical_covers")
        .select("series_title, issue_number, storage_path, cover_date, series_year")
        .in("series_title", seriesTitles)
        .in("issue_number", issueNumbers)
        .not("storage_path", "is", null);
      for (const c of covers ?? []) {
        const key = `${norm(c.series_title)}::${norm(c.issue_number)}`;
        if (!coversByKey.has(key)) coversByKey.set(key, []);
        coversByKey.get(key).push(c);
      }
    }

    // ── Ownership lookup for the viewer (if provided) ─────────────────────
    const ownedSet = new Set();
    const wishlistSet = new Set();
    if (viewerId && gcdIds.length > 0) {
      const { data: collected } = await supabase
        .from("user_collections")
        .select("gcd_issue_id, status")
        .eq("user_id", viewerId)
        .in("gcd_issue_id", gcdIds);
      for (const r of collected ?? []) {
        const gid = Number(r.gcd_issue_id);
        if (r.status === "owned") ownedSet.add(gid);
        else if (r.status === "wishlist") wishlistSet.add(gid);
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const issuesOut = issues.map((i) => {
      const key = `${norm(i.series_title)}::${norm(i.issue_number)}`;
      const candidates = coversByKey.get(key) ?? [];
      const targetYear = i.gcd_issue_id != null ? yearByGcdId.get(i.gcd_issue_id) : null;
      const storagePath = pickBestCover(candidates, targetYear);
      const cover = storagePath
        ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${storagePath}`
        : null;
      const gid = i.gcd_issue_id != null ? Number(i.gcd_issue_id) : null;
      return {
        cv_issue_id: i.cv_issue_id,
        cv_issue_name: i.cv_issue_name,
        cv_site_url: i.cv_site_url,
        gcd_issue_id: gid,
        series_title: i.series_title,
        issue_number: i.issue_number,
        sort_order: i.sort_order,
        cover,
        href: gid != null ? `/issue/gcd-${gid}` : null,
        owned: gid != null && ownedSet.has(gid),
        wishlisted: gid != null && wishlistSet.has(gid),
      };
    });

    const ownedCount = issuesOut.filter((i) => i.owned).length;
    const matchableCount = issuesOut.filter((i) => i.gcd_issue_id != null).length;
    const totalCount = issuesOut.length;

    return NextResponse.json({
      arc: {
        id: arc.id,
        cv_id: arc.cv_id,
        name: arc.name,
        deck: arc.deck,
        description: arc.description,
        publisher: arc.publisher_name,
        image_url: arc.image_url,
        cv_count_issues: arc.cv_count_issues,
      },
      issues: issuesOut,
      ownership: {
        owned: ownedCount,
        total: totalCount,
        matchable: matchableCount,
      },
    });
  } catch (err) {
    console.error("GET /api/story-arc/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
