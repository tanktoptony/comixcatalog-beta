import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req, { params }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sb = getServiceClient();
  const { data: sale, error } = await sb.from("sold_items").select("id, seller_id, buyer_id, gcd_issue_id, comic_id, series_title, issue_number, variant_label, condition, grade_numeric, slab_company, slab_cert_number, user_cover_url, seller_photo_keys, sale_price, currency, status, sold_at").eq("id", id).eq("buyer_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load purchase." }, { status: 500 });
  if (!sale) return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  const { data: seller } = await sb.from("profiles").select("username, display_name").eq("id", sale.seller_id).maybeSingle();
  return NextResponse.json({ ...sale, seller });
}
