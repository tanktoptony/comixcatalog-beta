import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 100), 100));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Count user-added comics so browse mode can page through:
    // 1) user comics first
    // 2) then GCD comics
    const { count: userCount, error: countError } = await supabase
      .from("comics")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("GET /api/comics user count failed:", countError);
      return NextResponse.json({ comics: [] });
    }

    const safeUserCount = userCount ?? 0;
    const userOffset = Math.min(offset, safeUserCount);
    const userLimit = Math.max(0, Math.min(limit, safeUserCount - userOffset));

    let userRows = [];
    if (userLimit > 0) {
      const { data, error } = await supabase
        .from("comics")
        .select(`
          id,
          series_title,
          publisher,
          issue_number,
          release_year,
          variant_name,
          created_at,
          comic_covers (
            image_path,
            is_primary
          )
        `)
        .order("created_at", { ascending: false })
        .range(userOffset, userOffset + userLimit - 1);

      if (error) {
        console.error("GET /api/comics user rows failed:", error);
        return NextResponse.json({ comics: [] });
      }

      userRows = (data ?? []).map((comic) => ({
        id: comic.id,
        series_title: comic.series_title ?? null,
        publisher: comic.publisher ?? null,
        issue_number: comic.issue_number,
        release_year: comic.release_year,
        variant_name: comic.variant_name,
        cover_path:
          comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null,
      }));
    }

    const remaining = limit - userRows.length;
    let gcdRows = [];

    if (remaining > 0) {
      const gcdOffset = Math.max(0, offset - safeUserCount);

      const { data: issues, error: issuesError } = await supabase
        .from("gcd_issues")
        .select(`
          gcd_id,
          series_gcd_id,
          publisher_gcd_id,
          issue_number,
          title,
          publication_date
        `)
        .order("gcd_id", { ascending: true })
        .range(gcdOffset, gcdOffset + remaining - 1);

      if (issuesError) {
        console.error("GET /api/comics gcd issues failed:", issuesError);
        return NextResponse.json({ comics: userRows });
      }

      const seriesGcdIds = [...new Set((issues ?? []).map((i) => i.series_gcd_id).filter(Boolean))];
      const publisherGcdIds = [...new Set((issues ?? []).map((i) => i.publisher_gcd_id).filter(Boolean))];

      let seriesLookup = {};
      if (seriesGcdIds.length > 0) {
        const { data: seriesRows, error: seriesError } = await supabase
          .from("series")
          .select("gcd_id, title")
          .in("gcd_id", seriesGcdIds);

        if (seriesError) {
          console.error("GET /api/comics gcd series failed:", seriesError);
        } else {
          seriesLookup = Object.fromEntries(
            (seriesRows ?? []).map((row) => [String(row.gcd_id), row.title])
          );
        }
      }

      let publisherLookup = {};
      if (publisherGcdIds.length > 0) {
        const { data: publisherRows, error: publisherError } = await supabase
          .from("publishers")
          .select("gcd_id, name")
          .in("gcd_id", publisherGcdIds);

        if (publisherError) {
          console.error("GET /api/comics gcd publishers failed:", publisherError);
        } else {
          publisherLookup = Object.fromEntries(
            (publisherRows ?? []).map((row) => [String(row.gcd_id), row.name])
          );
        }
      }

      gcdRows = (issues ?? []).map((issue) => ({
        id: `gcd-${issue.gcd_id}`,
        series_title: seriesLookup[String(issue.series_gcd_id)] ?? issue.title ?? null,
        publisher: publisherLookup[String(issue.publisher_gcd_id)] ?? null,
        issue_number: issue.issue_number,
        release_year: parseYear(issue.publication_date),
        variant_name: null,
        cover_path: null,
      }));
    }

    return NextResponse.json({
      comics: [...userRows, ...gcdRows],
    });
  } catch (err) {
    console.error("GET /api/comics crashed:", err);
    return NextResponse.json({ comics: [] });
  }
}

export async function POST(req) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let formData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid form submission" },
      { status: 400 }
    );
  }

  const series_title = formData.get("series_title");
  const issue_number = formData.get("issue_number");
  const publisher_name = formData.get("publisher");
  const release_year = formData.get("release_year");
  const coverFile = formData.get("cover");
  const created_by = formData.get("created_by");

  if (!series_title || !issue_number || !publisher_name) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    let { data: publisher } = await supabase
      .from("publishers")
      .select("*")
      .eq("name", publisher_name)
      .single();

    if (!publisher) {
      const { data: newPublisher, error } = await supabase
        .from("publishers")
        .insert({ name: publisher_name })
        .select()
        .single();

      if (error) throw error;
      publisher = newPublisher;
    }

    let { data: series } = await supabase
      .from("series")
      .select("*")
      .eq("title", series_title)
      .eq("publisher_id", publisher.id)
      .single();

    if (!series) {
      const { data: newSeries, error } = await supabase
        .from("series")
        .insert({
          title: series_title,
          publisher_id: publisher.id,
        })
        .select()
        .single();

      if (error) throw error;
      series = newSeries;
    }

    const { data: comic, error: comicError } = await supabase
      .from("comics")
      .insert({
        series_id: series.id,
        series_title,
        publisher: publisher_name,
        issue_number,
        release_year: release_year ? Number(release_year) : null,
        created_by,
      })
      .select()
      .single();

    if (comicError) throw comicError;

    if (coverFile && coverFile.size > 0) {
      const path = `${comic.id}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("comic-covers")
        .upload(path, coverFile, { upsert: true });

      if (!uploadError) {
        await supabase.from("comic_covers").insert({
          comic_id: comic.id,
          image_path: path,
          is_primary: true,
          uploaded_by: created_by,
        });
      }
    }

    return NextResponse.json({ comic }, { status: 201 });
  } catch (err) {
    console.error("POST /api/comics failed:", err);
    return NextResponse.json(
      { error: "Failed to create comic" },
      { status: 500 }
    );
  }
}