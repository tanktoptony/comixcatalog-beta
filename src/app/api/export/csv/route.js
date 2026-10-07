// CSV export of an authenticated user's collection.
//
// Output is one row per user_collections entry (owned + wishlist + for_sale),
// with metadata resolved from comics (for local rows) or gcd_issues+series
// (for GCD rows). The resolved_publisher_cached value is preferred - it's the
// year-aware audited publisher used everywhere else in the read path.

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import Papa from "papaparse";
import { getAuthedUser } from "@/lib/authServer";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { bestYearFor } from "@/lib/years";

const IN_CHUNK = 500;

async function fetchInChunks(ids, build, orderCol) {
  const rows = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    rows.push(...(await fetchAllPages(() => build(chunk), orderCol)));
  }
  return rows;
}

function csvSafe(value) {
  // Papa handles escaping. Just normalize null/undefined to empty string so
  // the output never contains the literal "null".
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

    const supabase = getServiceClient();

    const [{ data: profile }, { data: collection, error: collErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("username")
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
      const { data: localRows, error: localRowsError } = await supabase
        .from("comics")
        .select("id, series_title, issue_number, publisher, release_year")
        .in("id", localIds);
      if (localRowsError) {
        console.error("CSV export local comics lookup failed:", localRowsError.code, localRowsError.message);
        return NextResponse.json({ error: "Failed to load export rows" }, { status: 502 });
      }
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
      const issues = await fetchInChunks(
        gcdIds,
        (ids) => supabase
          .from("gcd_issues")
          .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
          .in("gcd_id", ids),
        "gcd_id"
      );

      const seriesGcdIds = [
        ...new Set((issues ?? []).map((i) => i.series_gcd_id).filter(Boolean)),
      ];
      const seriesByGcdId = {};
      if (seriesGcdIds.length > 0) {
        const seriesRows = await fetchInChunks(
          seriesGcdIds,
          (ids) => supabase
            .from("series")
            .select("id, gcd_id, title, resolved_publisher_cached")
            .in("gcd_id", ids),
          "id"
        );
        for (const s of seriesRows) {
          seriesByGcdId[String(s.gcd_id)] = s;
        }
      }

      for (const issue of issues) {
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
