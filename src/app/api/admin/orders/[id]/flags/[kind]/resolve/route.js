import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getServiceClient } from "@/lib/supabase/service";

const KINDS = new Set(["shared_card", "offplatform_terms"]);

export async function POST(req, { params }) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const { id, kind } = await params;
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: "Invalid flag." }, { status: 400 });
  }
  const { data, error } = await getServiceClient().rpc("admin_resolve_order_flag", {
    p_order: id,
    p_kind: kind,
    p_admin: auth.admin.id,
  });
  if (error?.code === "P0002") {
    return NextResponse.json({ error: "Flag not found." }, { status: 404 });
  }
  if (error) {
    return NextResponse.json({ error: "Could not mark flag reviewed." }, { status: 500 });
  }
  return NextResponse.json({ flag: data });
}
