import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/authServer";
import { validateListingEdit } from "@/lib/listingEdit";
import { revalidateListings } from "@/lib/marketplace";

// PATCH /api/listings/:id
// The seller edits their own listing: price, shipping, offers, condition
// notes, restored/signed. Listings have no user write policies (migration
// 0031), so every change goes through here: the caller must own the
// listing, it must still be draft or active (a reserved or sold listing is
// frozen), and the fields are validated by src/lib/listingEdit.js.
export async function PATCH(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to edit your listing." }, { status: 401 });

  const { id } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read that request." }, { status: 400 });
  }
  const { patch, error: invalid } = validateListingEdit(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const sb = getServiceClient();
  try {
    const { data, error } = await sb
      .from("listings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("seller_id", user.id)
      .in("status", ["draft", "active"])
      .select("id, price_cents, shipping_cents, accepts_offers, condition_notes, restored, signed")
      .maybeSingle();
    if (error) throw error;
    // Not yours, gone, or mid-checkout: same answer either way.
    if (!data) return NextResponse.json({ error: "That listing can't be edited right now." }, { status: 404 });
    revalidateListings();
    return NextResponse.json({ listing: data });
  } catch (err) {
    console.error("PATCH /api/listings/[id] failed:", err);
    return NextResponse.json({ error: "Couldn't save your listing. Please try again." }, { status: 500 });
  }
}
