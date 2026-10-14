import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { partyOrder } from "@/lib/orderRoute";
import { getServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getServiceClient();
  try {
    const order = await partyOrder(db, id, user.id);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data, error } = await db
      .from("messages")
      .select("id,sender_id,recipient_id,body,is_system,created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ messages: data || [] });
  } catch (error) {
    console.error("GET order messages failed:", error);
    return NextResponse.json({ error: "Could not load messages." }, { status: 500 });
  }
}
