import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/comics — the no-query "browse" surface for /search.
//
// Previously this returned a flat dump of user-added comics (mostly garbage
// "Untitled #[nn]" rows with no covers) followed by GCD issues ordered by
// gcd_id ASC (= oldest first, mostly coverless). The result was a search
// landing page full of empty cards.
//
// New behavior: surface curated *series* tiles — only series that have a
// canonical featured cover, ordered by issue count (so Batman / X-Men / etc.
// surface first). Each row uses the series UUID as `series-<id>` and links to
// /series/<id>. SearchPageClient renders them like comic cards but routes to
// the series page instead.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 36), 100));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: featuredSeries, error: seriesError } = await supabase
      .from("series")
      .select(`
        id,
        title,
        resolved_publisher_cached,
        year_start_cached,
        issue_count_cached,
        featured_cover_path_cached
      `)
      .not("featured_cover_path_cached", "is", null)
      .gt("issue_count_cached", 0)
      .order("issue_count_cached", { ascending: false })
      .range(offset, offset + limit - 1);

    if (seriesError) {
      console.error("GET /api/comics featured series failed:", seriesError);
      return NextResponse.json({ comics: [] });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const comics = (featuredSeries ?? []).map((s) => ({
      id: `series-${s.id}`,
      series_id: s.id,
      series_title: s.title ?? "Untitled",
      publisher: s.resolved_publisher_cached ?? "Unknown Publisher",
      issue_number: null,
      release_year: s.year_start_cached ?? null,
      issue_count: s.issue_count_cached ?? 0,
      cover_path: s.featured_cover_path_cached
        ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${s.featured_cover_path_cached}`
        : null,
      created_by: null,
      __source: "series",
    }));

    return NextResponse.json({ comics });
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