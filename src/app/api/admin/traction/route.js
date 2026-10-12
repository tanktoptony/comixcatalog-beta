import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getServiceClient } from "@/lib/supabase/service";
import { TEST_ACCOUNT_USERNAMES } from "@/lib/traction";

export async function GET(req) {
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const { data, error } = await getServiceClient().rpc("traction_report", {
    p_excluded_usernames: TEST_ACCOUNT_USERNAMES,
  });
  if (error) return NextResponse.json({ error: "Could not load traction report" }, { status: 500 });
  return NextResponse.json(data);
}
