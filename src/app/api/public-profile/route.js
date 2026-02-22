import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  // 1️⃣ Get profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, is_public")
    .eq("username", username)
    .single();

  if (profileError || !profile || !profile.is_public) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 2️⃣ Get collection
  const { data: collection, error: collectionError } = await supabase
    .from("user_collections")
    .select(`
    id,
    status,
    condition,
    grade_numeric,
    slab_company,
    slab_cert_number,
    notes,
    comic_id,
    comics!user_collections_comic_id_fkey (
        id,
        series_title,
        issue_number,
        release_year,
        comic_covers!comic_covers_comic_id_fkey (
        image_path,
        is_primary
        )
    )
    `)
    .eq("user_id", profile.id)
    .eq("status", "owned");

  if (collectionError) {
    return NextResponse.json({ error: "Failed to load collection" }, { status: 500 });
  }

  return NextResponse.json({
    username: profile.username,
    collection: collection || []
  });
}