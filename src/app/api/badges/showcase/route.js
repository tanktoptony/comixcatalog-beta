import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { BADGES_BY_ID } from "@/lib/badges/catalog";

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const badges = [...new Set(body?.badges ?? [])];
  if (badges.length > 4 || badges.some((id) => !BADGES_BY_ID.has(id))) {
    return NextResponse.json({ error: "Choose up to 4 valid badges" }, { status: 400 });
  }
  const db = getServiceClient();
  const { data: earned, error } = await db.from("user_badges").select("badge_id").eq("user_id", user.id).in("badge_id", badges);
  if (error) return NextResponse.json({ error: "Could not validate badges" }, { status: 500 });
  if ((earned ?? []).length !== badges.length) return NextResponse.json({ error: "Only earned badges can be showcased" }, { status: 400 });
  const result = await db.from("profiles").update({ showcase_badges: badges }).eq("id", user.id);
  if (result.error) return NextResponse.json({ error: "Could not save showcase" }, { status: 500 });
  return NextResponse.json({ badges });
}
