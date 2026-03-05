import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Step 1 — get activity
  const { data: activity, error } = await supabase
    .from("user_collections")
    .select("status, created_at, comic_id, user_id")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Activity error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const comicIds = activity.map((a) => a.comic_id);
  const userIds = activity.map((a) => a.user_id);

  // Step 2 — get comics
  const { data: comics } = await supabase
    .from("comics")
    .select("id, series_title, issue_number")
    .in("id", comicIds);

  // Step 3 — get usernames
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", userIds);

  // Step 4 — merge
  const comicsMap = Object.fromEntries(comics.map(c => [c.id, c]));
  const profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));

  const result = activity.map((a) => ({
    ...a,
    comics: comicsMap[a.comic_id],
    profiles: profilesMap[a.user_id],
  }));

  return NextResponse.json({ activity: result });
}