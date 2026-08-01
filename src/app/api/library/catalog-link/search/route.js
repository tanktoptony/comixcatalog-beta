// GET /api/library/catalog-link/search
//
// Two modes, controlled by `mode`:
//
//   mode=series (default) — search the catalog for series whose title matches
//      `q` (ILIKE on title and title_normalized). Returns up to 20 series
//      with metadata (year span, publisher, issue count, sample cover). If
//      `issue` is provided as a hint, each result also carries a
//      `matching_issue` field — the specific gcd_issue for that issue
//      number under this series, or null if the series doesn't carry it.
//
//   mode=issue — given a `series_gcd_id` and `issue` number, return the
//      matching gcd_issue (one row or null). Used after the user picks a
//      series in the modal, in case they want to pick a different issue #
//      than the one we suggested.
//
// Pro-gated.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_ID } from "@/lib/admin";
import { getAuthedUser } from "@/lib/authServer";

function normTitle(v) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normIssue(v) {
  return String(v ?? "").trim().toLowerCase();
}
function parseYear(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 1800 && n < 2200) return n;
  const m = String(v).match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}
function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
}

async function assertPro(supabase, user_id) {
  if (user_id === ADMIN_ID) return true;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_pro, is_founding_collector")
    .eq("id", user_id)
    .single();
  return Boolean(profile?.is_pro || profile?.is_founding_collector);
}

export async function GET(req) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = authedUser.id;

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "series";

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

    // ─────────────────────────────────────────────────────────────────────
    // mode=issue — return the gcd_issue for (series_gcd_id, issue)
    // ─────────────────────────────────────────────────────────────────────
    if (mode === "issue") {
      const series_gcd_id = Number(searchParams.get("series_gcd_id"));
      const issue = (searchParams.get("issue") ?? "").trim();
      if (!series_gcd_id || !issue) {
        return NextResponse.json({ error: "series_gcd_id + issue required" }, { status: 400 });
      }
      const iNorm = normIssue(issue);

      const { data: issues } = await supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date, title")
        .eq("series_gcd_id", series_gcd_id);

      const hits = (issues ?? []).filter((i) => normIssue(i.issue_number) === iNorm);

      // Look up a canonical_cover for any of these via the series's title.
      const { data: series } = await supabase
        .from("series")
        .select("title")
        .eq("gcd_id", series_gcd_id)
        .maybeSingle();

      let coverIndex = new Map();
      if (series?.title) {
        const { data: covers } = await supabase
          .from("canonical_covers")
          .select("issue_number, storage_path, cover_date, series_year")
          .eq("series_title", series.title)
          .eq("issue_number", issue)
          .not("storage_path", "is", null);
        for (const c of covers ?? []) {
          const key = normIssue(c.issue_number);
          if (!coverIndex.has(key)) coverIndex.set(key, c);
        }
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const results = hits
        .map((i) => {
          const c = coverIndex.get(normIssue(i.issue_number));
          return {
            gcd_issue_id: Number(i.gcd_id),
            issue_number: i.issue_number,
            issue_title: i.title ?? null,
            issue_year: bestYearFor(i),
            cover_url: c?.storage_path
              ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${c.storage_path}`
              : null,
          };
        })
        // Lowest gcd_id first = base issue (variants come after).
        .sort((a, b) => a.gcd_issue_id - b.gcd_issue_id);

      return NextResponse.json({ results });
    }

    // ─────────────────────────────────────────────────────────────────────
    // mode=series — search series, optionally hint a specific issue number
    // ─────────────────────────────────────────────────────────────────────
    const q = (searchParams.get("q") ?? "").trim();
    const issueHint = (searchParams.get("issue") ?? "").trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const qNorm = normTitle(q);
    const { data: seriesRows } = await supabase
      .from("series")
      .select("id, gcd_id, title, title_normalized, year_start_cached, year_end_cached, issue_count_cached, resolved_publisher_cached, featured_cover_path_cached")
      .or(`title.ilike.%${q}%,title_normalized.ilike.%${qNorm}%`)
      .not("gcd_id", "is", null)
      .limit(20);

    if (!seriesRows?.length) {
      return NextResponse.json({ results: [] });
    }

    // For each series, look up the hinted issue (if any) in gcd_issues.
    // One batched query for all series at once.
    const seriesGcdIds = seriesRows.map((s) => s.gcd_id);
    const hintNorm = issueHint ? normIssue(issueHint) : null;

    const matchingIssuesBySeries = new Map();
    if (hintNorm) {
      const { data: issues } = await supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date, title")
        .in("series_gcd_id", seriesGcdIds);
      for (const i of issues ?? []) {
        if (normIssue(i.issue_number) !== hintNorm) continue;
        const key = String(i.series_gcd_id);
        // Keep the lowest gcd_id (base cover) per series.
        const prev = matchingIssuesBySeries.get(key);
        if (!prev || Number(i.gcd_id) < prev.gcd_id) {
          matchingIssuesBySeries.set(key, {
            gcd_id: Number(i.gcd_id),
            issue_number: i.issue_number,
            issue_year: bestYearFor(i),
            issue_title: i.title ?? null,
          });
        }
      }
    }

    // Cover lookup: for each (series_title, hinted issue) pair, find a cover.
    // We don't try to cover every issue of every series — that explodes —
    // just the suggested one per series.
    const seriesTitles = seriesRows.map((s) => s.title).filter(Boolean);
    const coverIndex = new Map();
    if (hintNorm && seriesTitles.length > 0) {
      const { data: covers } = await supabase
        .from("canonical_covers")
        .select("series_title, issue_number, storage_path, cover_date, series_year")
        .in("series_title", seriesTitles)
        .eq("issue_number", issueHint)
        .not("storage_path", "is", null);
      for (const c of covers ?? []) {
        const key = normTitle(c.series_title);
        if (!coverIndex.has(key)) coverIndex.set(key, c);
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const results = seriesRows
      .map((s) => {
        const matchingIssue = matchingIssuesBySeries.get(String(s.gcd_id)) ?? null;
        const coverRow = coverIndex.get(normTitle(s.title));
        const sampleCover = coverRow?.storage_path
          ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${coverRow.storage_path}`
          : s.featured_cover_path_cached
            ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${s.featured_cover_path_cached}`
            : null;
        return {
          series_id: s.id,
          series_gcd_id: s.gcd_id,
          series_title: s.title,
          series_year_start: s.year_start_cached,
          series_year_end: s.year_end_cached,
          publisher: s.resolved_publisher_cached,
          issue_count: s.issue_count_cached,
          sample_cover_url: sampleCover,
          // matching_issue: null when the user's hinted issue # isn't in this
          // series. The UI still shows the series so they can browse it for a
          // different issue.
          matching_issue: matchingIssue
            ? {
                gcd_issue_id: matchingIssue.gcd_id,
                issue_number: matchingIssue.issue_number,
                issue_year: matchingIssue.issue_year,
                issue_title: matchingIssue.issue_title,
              }
            : null,
        };
      })
      .sort((a, b) => {
        // Series with matching_issue first.
        if (!!a.matching_issue !== !!b.matching_issue) return a.matching_issue ? -1 : 1;
        // Then by series year (oldest first).
        const ya = a.series_year_start ?? 9999;
        const yb = b.series_year_start ?? 9999;
        return ya - yb;
      });

    return NextResponse.json({ results });
  } catch (err) {
    console.error("GET /api/library/catalog-link/search crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
