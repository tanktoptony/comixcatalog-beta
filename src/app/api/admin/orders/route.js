import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || null;
  if (status && !["paid", "shipped", "disputed", "refunded"].includes(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  const beforeText = url.searchParams.get("before");
  const before = beforeText && !Number.isNaN(Date.parse(beforeText)) ? new Date(beforeText).toISOString() : null;
  if (beforeText && !before) return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  const { data, error } = await getServiceClient().rpc("admin_order_search", {
    p_query: url.searchParams.get("q") || null,
    p_status: status,
    p_limit: 50,
    p_before: before,
  });
  if (error) return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  return NextResponse.json({ orders: data || [] });
}
