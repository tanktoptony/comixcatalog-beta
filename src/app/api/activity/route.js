import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: activityData, error: activityError } = await supabase
      .from("user_collections")
      .select("status, created_at, comic_id, user_id")
      .order("created_at", { ascending: false })
      .limit(20);

    if (activityError) {
      console.error("Activity error:", activityError);
      return NextResponse.json({ activity: [] }, { status: 500 });
    }

    const activity = Array.isArray(activityData) ? activityData : [];

    if (activity.length === 0) {
      return NextResponse.json({ activity: [] });
    }

    const comicIds = [
      ...new Set(activity.map((a) => String(a.comic_id)).filter(Boolean)),
    ];
    const userIds = [
      ...new Set(activity.map((a) => String(a.user_id)).filter(Boolean)),
    ];

    const [comicsResult, profilesResult] = await Promise.all([
      supabase
        .from("comics")
        .select("id, series_title, issue_number")
        .in("id", comicIds),
      supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds),
    ]);

    if (comicsResult.error) {
      console.error("Comics lookup error:", comicsResult.error);
    }

    if (profilesResult.error) {
      console.error("Profiles lookup error:", profilesResult.error);
    }

    const comics = Array.isArray(comicsResult.data) ? comicsResult.data : [];
    const profiles = Array.isArray(profilesResult.data) ? profilesResult.data : [];

    const comicsMap = Object.fromEntries(
      comics.map((c) => [String(c.id), c])
    );

    const profilesMap = Object.fromEntries(
      profiles.map((p) => [String(p.id), p])
    );

    const result = activity.map((a) => ({
      ...a,
      comics: comicsMap[String(a.comic_id)] ?? null,
      profiles: profilesMap[String(a.user_id)] ?? null,
    }));

    return NextResponse.json({ activity: result });
  } catch (error) {
    console.error("Unhandled activity route error:", error);
    return NextResponse.json({ activity: [] }, { status: 500 });
  }
}