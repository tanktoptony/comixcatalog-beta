import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await getServiceClient().rpc("confirm_sale_transfer", { p_sale_id: id, p_buyer_id: user.id });
  if (error) {
    const status = error.code === "P0002" ? 404 : error.code === "42501" ? 403 : error.code === "22023" ? 409 : 500;
    return NextResponse.json({ error: status === 500 ? "Could not confirm purchase." : error.message }, { status });
  }
  return NextResponse.json({ ok: true, collectionItemId: data });
}
