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
    return NextResponse.json(
      { error: "Username required" },
      { status: 400 }
    );
  }

  // -------------------------
  // 1️⃣ Get Profile
  // -------------------------
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, is_public, avatar_key, is_founding_collector")
    .eq("username", username)
    .single();

  if (profileError || !profile || !profile.is_public) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 }
    );
  }

  // -------------------------
  // 2️⃣ Get Collection
  // -------------------------
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
      purchase_price,
      comic_id,
      comics!user_collections_comic_id_fkey (
        id,
        issue_number,
        release_year,
        series_title,
        publisher,
        comic_covers (
          image_path,
          is_primary
        )
      )
    `)
    .eq("user_id", profile.id);

  if (collectionError) {
    return NextResponse.json(
      { error: "Failed to load collection" },
      { status: 500 }
    );
  }

  // -------------------------
  // Normalize Collection
  // -------------------------
  const normalizedCollection = (collection || []).map((item) => ({
    ...item,
    comics: {
      ...item.comics,
      series_title:
        item.comics?.series_title ||
        item.comics?.title ||
        "Untitled",
    },
  }));

  // -------------------------
  // Publisher Stats
  // -------------------------
  const publisherCounts = {};

  normalizedCollection.forEach((item) => {
    const pub = item.comics?.publisher;
    if (!pub) return;

    publisherCounts[pub] = (publisherCounts[pub] || 0) + 1;
  });

  const dominantPublisher =
    Object.entries(publisherCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // -------------------------
  // Return
  // -------------------------
  return NextResponse.json({
    profile,
    collection: normalizedCollection,
    dominantPublisher,
  });
}