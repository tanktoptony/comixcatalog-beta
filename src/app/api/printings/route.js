// POST /api/printings — report a printing of an issue the catalog already has.
// GET  /api/printings?gcd_issue_id=… — the accepted reports for that issue.
//
// The Discogs move this is copying: when you find a near-match, the next
// step is not "stop, we have it", it is "tell us how yours differs". A
// different pressing is a new Release under the same Master, not a
// duplicate, and the thing that identifies it is printed on the object.
//
// For comics that identifier is the barcode, which nothing in the catalog
// carried before this: gcd_issues is gcd_id, series_gcd_id, issue_number,
// title, publication_date, key_date, publisher_gcd_id.
//
// Reports land in issue_printings as `pending` and are not promoted
// automatically. 27 users cannot out-vote a bad edit the way Discogs'
// millions can, so review here is a person looking, not a quorum.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/authServer";
import { normalizeUpc, isValidUpc, upcProblem } from "@/lib/printings";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const gcdIssueId = Number(searchParams.get("gcd_issue_id"));
    if (!Number.isInteger(gcdIssueId) || gcdIssueId <= 0) {
      return NextResponse.json({ error: "gcd_issue_id required" }, { status: 400 });
    }

    // Only accepted reports are public. A pending one is somebody's
    // unreviewed guess and must not read as catalog fact.
    const { data, error } = await admin()
      .from("issue_printings")
      .select("id, printing_name, upc, created_at")
      .eq("gcd_issue_id", gcdIssueId)
      .eq("status", "accepted")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET /api/printings failed:", error);
      return NextResponse.json({ printings: [] }, { status: 500 });
    }
    return NextResponse.json({ printings: data ?? [] });
  } catch (err) {
    console.error("GET /api/printings crashed:", err);
    return NextResponse.json({ printings: [] }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Sign in to report a printing." }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const gcdIssueId = Number(body?.gcd_issue_id);
    if (!Number.isInteger(gcdIssueId) || gcdIssueId <= 0) {
      return NextResponse.json({ error: "Which issue is this a printing of?" }, { status: 400 });
    }

    const printingName = String(body?.printing_name ?? "").trim().slice(0, 120) || null;
    const notes = String(body?.notes ?? "").trim().slice(0, 500) || null;
    const rawUpc = String(body?.upc ?? "");
    const upc = normalizeUpc(rawUpc) || null;

    if (upc && !isValidUpc(upc)) {
      // upcProblem says what is wrong and how to fix it, which is more use
      // than "invalid barcode".
      return NextResponse.json({ error: upcProblem(upc) }, { status: 400 });
    }
    if (!printingName && !upc) {
      return NextResponse.json(
        { error: "Give the printing a name, a barcode, or both." },
        { status: 400 }
      );
    }

    const supabase = admin();

    // The issue has to exist. A report against a gcd_id we do not carry is
    // unreviewable, and silently keeping it would grow a second shadow
    // catalog — the thing this whole feature exists to avoid.
    const { data: issue, error: issueError } = await supabase
      .from("gcd_issues")
      .select("gcd_id")
      .eq("gcd_id", gcdIssueId)
      .maybeSingle();

    if (issueError) {
      console.error("POST /api/printings issue check failed:", issueError);
      return NextResponse.json({ error: "Could not save that right now." }, { status: 500 });
    }
    if (!issue) {
      return NextResponse.json(
        { error: "We do not have that issue yet, so there is nothing to attach a printing to." },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("issue_printings")
      .insert({
        gcd_issue_id: gcdIssueId,
        printing_name: printingName,
        upc,
        notes,
        submitted_by: user.id,
        status: "pending",
      })
      .select("id, printing_name, upc, status")
      .single();

    if (error) {
      // 23505 is the unique index: this person already reported this exact
      // printing. Saying so is friendlier than a 500, and it is not a
      // failure from their side.
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: true, duplicate: true, message: "You have already reported this printing." },
          { status: 200 }
        );
      }
      console.error("POST /api/printings insert failed:", error);
      return NextResponse.json({ error: "Could not save that right now." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, printing: data }, { status: 201 });
  } catch (err) {
    console.error("POST /api/printings crashed:", err);
    return NextResponse.json({ error: "Could not save that right now." }, { status: 500 });
  }
}
