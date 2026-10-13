import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = getServiceClient();
  const { data: messages, error } = await sb.from("messages").select("sender_id, created_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "Could not load buyers." }, { status: 500 });
  const ids = [...new Set((messages ?? []).map((row) => row.sender_id))].slice(0, 20);
  if (!ids.length) return NextResponse.json([]);
  const [{ data: profiles, error: profileError }, { data: blocks, error: blockError }] = await Promise.all([
    sb.from("profiles").select("id, username, display_name, avatar_url, avatar_key").in("id", ids),
    sb.from("user_blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
  ]);
  if (profileError || blockError) return NextResponse.json({ error: "Could not load buyers." }, { status: 500 });
  const blocked = new Set((blocks ?? []).map((row) => row.blocker_id === user.id ? row.blocked_id : row.blocker_id));
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return NextResponse.json(ids.flatMap((id) => byId.has(id) && !blocked.has(id) ? [byId.get(id)] : []));
}
