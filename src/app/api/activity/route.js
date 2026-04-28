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
      .select("status, created_at, comic_id, gcd_issue_id, user_id")
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

    // Filter null/undefined BEFORE coercing to String — `String(null)` returns
    // the literal "null" (truthy), which would slip through `.filter(Boolean)`
    // and Postgres rejects "null" as a uuid (22P02). user_collections is
    // either-or: comic_id is null when the row points at a gcd_issue_id, and
    // we'd send "null" into the .in("id", …) UUID query on every fetch.
    const comicIds = [
      ...new Set(
        activity
          .map((a) => a.comic_id)
          .filter((v) => v != null)
          .map(String)
      ),
    ];
    const gcdIssueIds = [
      ...new Set(
        activity
          .map((a) => a.gcd_issue_id)
          .filter((v) => v != null && Number.isInteger(Number(v)))
          .map(Number)
      ),
    ];
    const userIds = [
      ...new Set(
        activity
          .map((a) => a.user_id)
          .filter((v) => v != null)
          .map(String)
      ),
    ];

    const [comicsResult, gcdIssuesResult, profilesResult] = await Promise.all([
      comicIds.length > 0
        ? supabase
            .from("comics")
            .select("id, series_title, issue_number")
            .in("id", comicIds)
        : Promise.resolve({ data: [], error: null }),
      gcdIssueIds.length > 0
        ? supabase
            .from("gcd_issues")
            .select("gcd_id, series_gcd_id, issue_number, title")
            .in("gcd_id", gcdIssueIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, username")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (comicsResult.error) {
      console.error("Comics lookup error:", comicsResult.error);
    }
    if (gcdIssuesResult.error) {
      console.error("GCD issues lookup error:", gcdIssuesResult.error);
    }
    if (profilesResult.error) {
      console.error("Profiles lookup error:", profilesResult.error);
    }

    const comics = Array.isArray(comicsResult.data) ? comicsResult.data : [];
    const gcdIssues = Array.isArray(gcdIssuesResult.data) ? gcdIssuesResult.data : [];
    const profiles = Array.isArray(profilesResult.data) ? profilesResult.data : [];

    // For GCD-source rows, also resolve the canonical series title (better
    // than the raw `gcd_issues.title` which is often null) and a cover from
    // canonical_covers via (series_title, issue_number) — same matching the
    // rest of the app uses.
    const seriesGcdIds = [
      ...new Set(gcdIssues.map((i) => i.series_gcd_id).filter((v) => v != null)),
    ];

    let seriesByGcdId = new Map();
    if (seriesGcdIds.length > 0) {
      const { data: seriesRows } = await supabase
        .from("series")
        .select("gcd_id, title")
        .in("gcd_id", seriesGcdIds);
      seriesByGcdId = new Map(
        (seriesRows ?? []).map((r) => [String(r.gcd_id), r.title])
      );
    }

    const issueResolved = gcdIssues.map((i) => ({
      gcd_id: i.gcd_id,
      issue_number: i.issue_number,
      series_title:
        seriesByGcdId.get(String(i.series_gcd_id)) ?? i.title ?? null,
    }));

    const seriesTitlesForCovers = [
      ...new Set(issueResolved.map((r) => r.series_title).filter(Boolean)),
    ];
    const issueNumbersForCovers = [
      ...new Set(
        issueResolved.map((r) => r.issue_number).filter((v) => v != null)
      ),
    ];

    const coverByKey = new Map();
    if (seriesTitlesForCovers.length > 0 && issueNumbersForCovers.length > 0) {
      const { data: coverRows } = await supabase
        .from("canonical_covers")
        .select("series_title, issue_number, storage_path")
        .in("series_title", seriesTitlesForCovers)
        .in("issue_number", issueNumbersForCovers)
        .not("storage_path", "is", null);

      for (const row of coverRows ?? []) {
        const key = `${String(row.series_title).trim().toLowerCase()}::${String(
          row.issue_number ?? ""
        )
          .trim()
          .toLowerCase()}`;
        if (!coverByKey.has(key)) coverByKey.set(key, row.storage_path);
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const gcdIssueByGcdId = new Map(
      issueResolved.map((r) => {
        const key = `${String(r.series_title ?? "").trim().toLowerCase()}::${String(
          r.issue_number ?? ""
        )
          .trim()
          .toLowerCase()}`;
        const storagePath = coverByKey.get(key) ?? null;
        return [
          String(r.gcd_id),
          {
            id: `gcd-${r.gcd_id}`,
            series_title: r.series_title,
            issue_number: r.issue_number,
            cover: storagePath
              ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${storagePath}`
              : null,
          },
        ];
      })
    );

    const comicsMap = Object.fromEntries(
      comics.map((c) => [String(c.id), c])
    );
    const profilesMap = Object.fromEntries(
      profiles.map((p) => [String(p.id), p])
    );

    const result = activity.map((a) => ({
      ...a,
      comics:
        a.comic_id != null
          ? comicsMap[String(a.comic_id)] ?? null
          : a.gcd_issue_id != null
          ? gcdIssueByGcdId.get(String(a.gcd_issue_id)) ?? null
          : null,
      profiles: profilesMap[String(a.user_id)] ?? null,
    }));

    return NextResponse.json({ activity: result });
  } catch (error) {
    console.error("Unhandled activity route error:", error);
    return NextResponse.json({ activity: [] }, { status: 500 });
  }
}