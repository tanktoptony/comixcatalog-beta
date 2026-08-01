// CSV export of a user's wantlist — Pro feature.
//
// Same auth posture as /api/export/csv (Pro-gated, ADMIN_ID short-circuit),
// but scoped to status = 'wishlist' rows only and shaped as a "shopping list"
// for cons and shops: series, issue, year, target price, notes. The
// 'condition' / slab columns are dropped — they don't apply to a book you
// don't own yet — and 'market_value' is renamed to 'target_price' to make
// the column's purpose obvious when sellers/buyers glance at it.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { ADMIN_ID } from "@/lib/admin";
import { getAuthedUser } from "@/lib/authServer";

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
}

function csvSafe(value) {
  if (value == null) return "";
  return value;
}

export async function POST(req) {
  try {
    const authedUser = await getAuthedUser(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = authedUser.id;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const [{ data: profile }, { data: collection, error: collErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("username, is_pro")
        .eq("id", user_id)
        .single(),
      supabase
        .from("user_collections")
        .select(
          "id, status, comic_id, gcd_issue_id, notes, market_value, created_at"
        )
        .eq("user_id", user_id)
        .eq("status", "wishlist")
        .order("created_at", { ascending: false }),
    ]);

    const isProOrAdmin = Boolean(profile?.is_pro) || user_id === ADMIN_ID;
    if (!isProOrAdmin) {
      return NextResponse.json(
        { error: "Pro tier required", upgrade: true },
        { status: 402 }
      );
    }

    if (collErr) {
      console.error("Wantlist export: query failed", collErr);
      return NextResponse.json(
        { error: `Failed to fetch wantlist: ${collErr.message}` },
        { status: 500 }
      );
    }

    if (!collection?.length) {
      return NextResponse.json(
        { error: "Your wantlist is empty" },
        { status: 404 }
      );
    }

    // Hydrate local + GCD metadata, same pattern as the full-collection export.
    const localIds = [
      ...new Set(collection.map((c) => c.comic_id).filter(Boolean)),
    ];
    const localById = {};
    if (localIds.length > 0) {
      const { data: localRows } = await supabase
        .from("comics")
        .select("id, series_title, issue_number, publisher, release_year")
        .in("id", localIds);
      for (const row of localRows ?? []) localById[row.id] = row;
    }

    const gcdIds = [
      ...new Set(
        collection
          .map((c) => c.gcd_issue_id)
          .filter((v) => v != null)
          .map(Number)
          .filter((n) => !Number.isNaN(n))
      ),
    ];
    const gcdById = {};
    if (gcdIds.length > 0) {
      const { data: issues } = await supabase
        .from("gcd_issues")
        .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
        .in("gcd_id", gcdIds);

      const seriesGcdIds = [
        ...new Set((issues ?? []).map((i) => i.series_gcd_id).filter(Boolean)),
      ];
      const seriesByGcdId = {};
      if (seriesGcdIds.length > 0) {
        const { data: seriesRows } = await supabase
          .from("series")
          .select("gcd_id, title, resolved_publisher_cached")
          .in("gcd_id", seriesGcdIds);
        for (const s of seriesRows ?? []) {
          seriesByGcdId[String(s.gcd_id)] = s;
        }
      }

      for (const issue of issues ?? []) {
        const s = seriesByGcdId[String(issue.series_gcd_id)];
        gcdById[issue.gcd_id] = {
          series_title: s?.title ?? null,
          publisher: s?.resolved_publisher_cached ?? null,
          issue_number: issue.issue_number,
          release_year: bestYearFor(issue),
        };
      }
    }

    // Shape rows as a shopping list. Sorted by title for con-floor scanning.
    const rows = collection
      .map((item) => {
        let meta = null;
        if (item.comic_id && localById[item.comic_id]) {
          const c = localById[item.comic_id];
          meta = {
            series_title: c.series_title,
            issue_number: c.issue_number,
            publisher: c.publisher,
            release_year: c.release_year,
          };
        } else if (item.gcd_issue_id && gcdById[item.gcd_issue_id]) {
          meta = gcdById[item.gcd_issue_id];
        }
        return {
          series_title: csvSafe(meta?.series_title),
          issue_number: csvSafe(meta?.issue_number),
          publisher: csvSafe(meta?.publisher),
          release_year: csvSafe(meta?.release_year),
          target_price: csvSafe(item.market_value),
          notes: csvSafe(item.notes),
          added_at: csvSafe(item.created_at),
        };
      })
      .sort((a, b) => {
        const ta = String(a.series_title || "").toLowerCase();
        const tb = String(b.series_title || "").toLowerCase();
        if (ta !== tb) return ta < tb ? -1 : 1;
        const ia = Number(a.issue_number);
        const ib = Number(b.issue_number);
        if (!Number.isNaN(ia) && !Number.isNaN(ib)) return ia - ib;
        return String(a.issue_number).localeCompare(String(b.issue_number));
      });

    const csv = Papa.unparse(rows);
    const username = (profile?.username || "wantlist").replace(/[^a-z0-9_-]/gi, "_");
    const date = new Date().toISOString().split("T")[0];
    const filename = `comixcatalog-wantlist-${username}-${date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("POST /api/export/wantlist crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
