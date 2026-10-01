import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { refreshListingSnapshots, revalidateListings } from "@/lib/marketplace";

// POST /api/listings/sync
// Called by the library right after it marks books for sale or takes them
// off sale. The user_collections trigger (migration 0031) has already
// created or withdrawn the listings; this fills in covers for the caller's
// new listings and expires the cached marketplace so the change shows on
// the next page load instead of up to two minutes later.
export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const refreshed = await refreshListingSnapshots({ sellerId: user.id });
    revalidateListings();
    return NextResponse.json({ refreshed });
  } catch (err) {
    console.error("POST /api/listings/sync failed:", err);
    return NextResponse.json({ error: "Could not sync listings" }, { status: 500 });
  }
}
