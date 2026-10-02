import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { isUuid, reorder } from "@/lib/listingPhotos";
import { adminClient } from "@/lib/listingPhotosServer";
import { revalidateListings } from "@/lib/marketplace";

// PATCH /api/listings/photos/order  { collectionId, ids }
// Sets the photo order for one of your books; the first is the lead photo.
export async function PATCH(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!isUuid(body?.collectionId)) return NextResponse.json({ error: "Pick a book first." }, { status: 400 });
  const sb = adminClient();
  try {
    const { data, error } = await sb.from("listing_photos").select("id").eq("collection_id", body.collectionId).eq("owner_id", user.id);
    if (error) throw error;
    const plan = reorder((data ?? []).map((p) => p.id), body.ids);
    if (plan.error) return NextResponse.json({ error: plan.error }, { status: 400 });
    for (const { id, sort_order } of plan) {
      const { error: e } = await sb.from("listing_photos").update({ sort_order }).eq("id", id).eq("owner_id", user.id);
      if (e) throw e;
    }
    revalidateListings();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("photo reorder failed:", err);
    return NextResponse.json({ error: "Couldn't save that order." }, { status: 500 });
  }
}
