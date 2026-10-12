import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await getServiceClient().rpc("claim_collection_milestones", { p_user_id: user.id });
  if (error) return NextResponse.json({ error: "Could not claim milestones" }, { status: 500 });
  return NextResponse.json(data);
}
