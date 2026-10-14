import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

const ORDER_FIELDS = [
  "id", "listing_id", "buyer_id", "seller_id", "series_title", "issue_number",
  "cover_path", "condition", "grade_numeric", "slab_company", "item_cents",
  "shipping_cents", "tax_cents", "total_cents", "currency", "status", "created_at",
  "paid_at", "shipped_at", "delivered_at", "completed_at", "cancelled_at", "refunded_at",
].join(",");

export async function GET(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getServiceClient();
  const { data, error } = await db
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("id", id)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load order" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const coverUrl = data.cover_path && (
    /^https?:\/\//i.test(data.cover_path)
      ? data.cover_path
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${data.cover_path}`
  );
  return NextResponse.json({ order: { ...data, cover_url: coverUrl || null } });
}
