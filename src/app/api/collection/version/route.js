// GET  /api/collection/version?gcd_issue_id=… — every version of that issue
//      (regular, newsstand, printings, cover variants) as picker tiles.
// POST /api/collection/version { id, gcd_issue_id } — say which version a
//      library copy is. Also used when a barcode shows the copy was saved
//      as the wrong issue altogether.
//
// Versions come from the same cached issue-page data the issue page uses,
// so the picker and the page can never disagree about what exists.

import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { getIssuePageData, resolveIssueEdition } from "@/lib/pageData";
import { isPickedCatalogCover, labelForVersion, versionChoices } from "@/lib/copyVersion";
import { refreshListingSnapshots, revalidateListings } from "@/lib/marketplace";

const toId = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export async function GET(req) {
  const gcdIssueId = toId(new URL(req.url).searchParams.get("gcd_issue_id"));
  if (!gcdIssueId) return NextResponse.json({ error: "gcd_issue_id required" }, { status: 400 });
  try {
    const edition = await resolveIssueEdition(gcdIssueId);
    if (!edition) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    const issue = await getIssuePageData(edition.baseGcdId, edition.baseGcdId, edition.hasEditionColumns);
    if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    return NextResponse.json({ base_gcd_issue_id: edition.baseGcdId, versions: versionChoices(issue) });
  } catch (error) {
    console.error("GET /api/collection/version failed:", error);
    return NextResponse.json({ error: "Could not load the versions of this issue." }, { status: 500 });
  }
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to edit your collection." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const targetId = toId(body?.gcd_issue_id);
  if (typeof body?.id !== "string" || !targetId) {
    return NextResponse.json({ error: "Send a collection id and the version to switch to." }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const { data: row, error: rowError } = await supabase.from("user_collections")
      .select("id, status, gcd_issue_id, user_cover_url, variant_label")
      .eq("id", body.id).eq("user_id", user.id).maybeSingle();
    if (rowError) throw rowError;
    if (!row) return NextResponse.json({ error: "That copy is not in your collection." }, { status: 404 });
    // Books added by hand (comic_id rows) have no catalog issue to move from.
    if (!toId(row.gcd_issue_id)) {
      return NextResponse.json({ error: "Link this book to the catalog first, then pick its version." }, { status: 409 });
    }
    if (Number(row.gcd_issue_id) === targetId) {
      return NextResponse.json({ item: row, unchanged: true });
    }

    const [{ data: target, error: targetError }, { data: details }] = await Promise.all([
      supabase.from("gcd_issues").select("gcd_id, base_gcd_issue_id, variant_name").eq("gcd_id", targetId).maybeSingle(),
      supabase.from("gcd_issue_details").select("variant_name").eq("gcd_issue_id", targetId).maybeSingle(),
    ]);
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: "We do not have that version on file." }, { status: 404 });

    const patch = {
      gcd_issue_id: targetId,
      variant_label: labelForVersion({
        gcdId: targetId,
        baseGcdId: target.base_gcd_issue_id ?? targetId,
        variantName: target.variant_name || details?.variant_name,
      }),
    };
    // A catalog cover picked for the old version would now show the wrong
    // book. The collector's own photo of their copy is still right.
    if (isPickedCatalogCover(row.user_cover_url)) patch.user_cover_url = null;

    const { data: updated, error: updateError } = await supabase.from("user_collections")
      .update(patch).eq("id", row.id).eq("user_id", user.id)
      .select("id, status, gcd_issue_id, user_cover_url, variant_label").maybeSingle();
    if (updateError) {
      // mkt_guard_collection_open_order: a sold-but-unshipped copy must keep
      // matching what the buyer paid for.
      if (updateError.code === "55006") {
        return NextResponse.json({ error: "This copy has an open order. You can change its version once the order is done." }, { status: 409 });
      }
      throw updateError;
    }

    // The listing trigger already moved a listed copy's listing to the new
    // issue; this fills in its cover and shows the change on the marketplace.
    if (row.status === "for_sale") {
      try {
        await refreshListingSnapshots({ sellerId: user.id, sb: supabase });
        revalidateListings();
      } catch (error) {
        console.error("version switch listing refresh failed:", error);
      }
    }

    return NextResponse.json({ item: updated, previous_gcd_issue_id: Number(row.gcd_issue_id) });
  } catch (error) {
    console.error("POST /api/collection/version failed:", error);
    return NextResponse.json({ error: "Could not change this copy right now." }, { status: 500 });
  }
}
