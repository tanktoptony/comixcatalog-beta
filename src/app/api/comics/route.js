import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/comics
 * Public listing for Search page
 */
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from("comics")
      .select(`
        id,
        series_title,
        publisher,
        issue_number,
        release_year,
        variant_name,
        created_by,
        comic_covers (
          image_path,
          is_primary
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/comics failed:", error);
      return NextResponse.json({ comics: [] });
    }

    const comics = (data ?? []).map((comic) => ({
      id: comic.id,
      series_title: comic.series_title ?? null,
      publisher: comic.publisher ?? null,
      issue_number: comic.issue_number,
      release_year: comic.release_year,
      variant_name: comic.variant_name,
      created_by: comic.created_by,
      cover_path:
        comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null,
    }));

    return NextResponse.json({ comics });
  } catch (err) {
    console.error("GET /api/comics crashed:", err);
    return NextResponse.json({ comics: [] });
  }
}

/**
 * POST /api/comics
 * Create comic (metadata + optional cover)
 */

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
    // 1️⃣ Find or create publisher
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

    // 2️⃣ Find or create series
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

    // 3️⃣ Insert comic using series_id
    const { data: comic, error: comicError } = await supabase
      .from("comics")
      .insert({
        series_id: series.id,
        series_title,          // ✅ ADD THIS
        publisher: publisher_name, // ✅ ADD THIS (important too)
        issue_number,
        release_year: release_year ? Number(release_year) : null,
        created_by,
      })
      .select()
      .single();

    if (comicError) throw comicError;

    // 4️⃣ Handle cover upload
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

