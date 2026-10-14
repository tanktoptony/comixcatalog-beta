import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(req, { params }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const body = await req.json().catch((error) => {
    console.error("Seller freeze JSON failed:", error);
    return null;
  });
  if (!body || typeof body.frozen !== "boolean" || String(body.reason || "").trim().length < 3) return NextResponse.json({ error: "Frozen state and reason are required." }, { status: 400 });
  const { userId } = await params;
  const { data, error } = await getServiceClient().rpc("seller_freeze_payouts", { p_admin: auth.admin.id, p_user: userId, p_frozen: body.frozen, p_reason: body.reason.trim() });
  if (error) return NextResponse.json({ error: error.code === "P0002" ? "Not found" : error.message }, { status: error.code === "P0002" ? 404 : 400 });
  return NextResponse.json({ seller: data });
}
