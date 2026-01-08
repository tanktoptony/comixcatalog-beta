import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(req) {
  const supabase = getSupabase();
  const { searchParams } = new URL(req.url);
  const user_id = searchParams.get("user_id");

  if (!user_id) {
    return NextResponse.json({ collections: [] });
  }

  const { data, error } = await supabase
    .from("user_collections")
    .select("*")
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ collections: data });
}

export async function POST(req) {
  const supabase = getSupabase();
  const { comic_id, status, user_id } = await req.json();

  if (!user_id || !comic_id || !status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_collections")
    .upsert({ comic_id, status, user_id }, { onConflict: "user_id,comic_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req) {
  const supabase = getSupabase();
  const { comic_id, user_id } = await req.json();

  if (!user_id || !comic_id) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_collections")
    .delete()
    .eq("comic_id", comic_id)
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
