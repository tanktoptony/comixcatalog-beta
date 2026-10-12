import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req) {
  try {
    const viewer = await getAuthedUser(req);
    const { data, error } = await getServiceClient().rpc("suggested_collectors", {
      p_viewer_id: viewer?.id ?? null,
      p_limit: 24,
    });
    if (error) throw new Error(`suggested collectors failed: ${error.message}`);
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("GET /api/follows/suggestions failed:", error);
    return NextResponse.json({ error: "Could not load collector suggestions." }, { status: 500 });
  }
}
