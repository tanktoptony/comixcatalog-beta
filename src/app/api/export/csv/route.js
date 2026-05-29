// CSV export of a user's collection — Pro feature.
//
// Mirrors the auth posture of /api/export/pdf: requires user_id in the POST
// body, looks up profiles.is_pro, allows ADMIN_ID through, returns 402 with
// { upgrade: true } if the caller isn't Pro. The frontend handler reads that
// flag and redirects to /upgrade (same UX as the PDF button).
//
// Output is one row per user_collections entry (owned + wishlist + for_sale),
// with metadata resolved from comics (for local rows) or gcd_issues+series
// (for GCD rows). The resolved_publisher_cached value is preferred — it's the
// year-aware audited publisher used everywhere else in the read path.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { ADMIN_ID } from "@/lib/admin";

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// publication_date is null on ~65% of gcd_issues; key_date fills the gap.
function bestYearFor(row) {
  return parseYear(row?.publication_date) ?? parseYear(row?.key_date);
}

function csvSafe(value) {
  // Papa handles escaping. Just normalize null/undefined to empty string so
  // the output never contains the literal "null".
  if (value == null) return "";
  return value;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_id } = body;
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

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
          "id, status, comic_id, gcd_issue_id, condition, grade_numeric, slab_company, slab_cert_number, notes, purchase_price, market_value, created_at"
        )
        .eq("user_id", user_id)
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
      console.error("CSV export: user_collections query failed", collErr);
      return NextResponse.json(
        { error: `Failed to fetch collection: ${collErr.message}` },
        { status: 500 }
      );
    }

    if (!collection?.length) {
      return NextResponse.json(
        { error: "Nothing to export" },
        { status: 404 }
      );
    }

    // Resolve local comic metadata.
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

    // Resolve GCD issue metadata + series (for title + publisher).
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

    const rows = collection.map((item) => {
      let meta = null;
      let source = "";
      if (item.comic_id && localById[item.comic_id]) {
        const c = localById[item.comic_id];
        meta = {
          series_title: c.series_title,
          issue_number: c.issue_number,
          publisher: c.publisher,
          release_year: c.release_year,
        };
        source = "user";
      } else if (item.gcd_issue_id && gcdById[item.gcd_issue_id]) {
        meta = gcdById[item.gcd_issue_id];
        source = "gcd";
      }

      return {
        series_title: csvSafe(meta?.series_title),
        issue_number: csvSafe(meta?.issue_number),
        publisher: csvSafe(meta?.publisher),
        release_year: csvSafe(meta?.release_year),
        status: csvSafe(item.status),
        condition: csvSafe(item.condition),
        slab_company: csvSafe(item.slab_company),
        grade_numeric: csvSafe(item.grade_numeric),
        slab_cert_number: csvSafe(item.slab_cert_number),
        purchase_price: csvSafe(item.purchase_price),
        market_value: csvSafe(item.market_value),
        notes: csvSafe(item.notes),
        added_at: csvSafe(item.created_at),
        source,
      };
    });

    const csv = Papa.unparse(rows);
    const username = (profile?.username || "collection").replace(/[^a-z0-9_-]/gi, "_");
    const date = new Date().toISOString().split("T")[0];
    const filename = `comixcatalog-${username}-${date}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("POST /api/export/csv crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
