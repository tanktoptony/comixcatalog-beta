import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req) {
  const { response } = await requireAdmin(req);
  if (response) return response;
  try {
    const { data, error } = await getServiceClient().rpc("check_listing_sync", { p_repair: false });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/listing-sync failed:", error);
    return NextResponse.json({ error: "Could not load listing sync status." }, { status: 500 });
  }
}
