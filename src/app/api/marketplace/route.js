import { NextResponse } from "next/server";
import { getListings, getListingsForIssue } from "@/lib/marketplace";
import { CDN_CACHE_MARKET } from "@/lib/cdnCache";

// GET /api/marketplace            -> { listings } (all, newest first)
// GET /api/marketplace?gcd=12345  -> { listings } for one catalog issue
// Public and viewer-independent (only public sellers' listings), so the
// CDN can cache it.
export async function GET(req) {
  try {
    const gcd = new URL(req.url).searchParams.get("gcd");
    const listings = gcd ? await getListingsForIssue(Number(gcd)) : await getListings();
    return NextResponse.json({ listings }, { headers: CDN_CACHE_MARKET });
  } catch (err) {
    console.error("GET /api/marketplace failed:", err);
    return NextResponse.json({ error: "Could not load listings" }, { status: 500 });
  }
}
