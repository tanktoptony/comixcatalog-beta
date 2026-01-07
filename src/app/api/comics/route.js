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
      .select(
        `
        id,
        series_title,
        issue_number,
        publisher,
        release_year,
        variant_name,
        comic_covers (
          image_path,
          is_primary
        )
        `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/comics failed:", error);
      return NextResponse.json({ comics: [] });
    }

    const comics = (data ?? []).map((comic) => ({
      ...comic,
      cover_path:
        comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null,
      comic_covers: undefined,
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
    console.error("Failed to read formData:", err);
    return NextResponse.json(
      { error: "Invalid form submission" },
      { status: 400 }
    );
  }

  const series_title = formData.get("series_title");
  const issue_number = formData.get("issue_number");
  const publisher = formData.get("publisher");
  const release_year = formData.get("release_year");
  const coverFile = formData.get("cover");

  if (!series_title || !issue_number || !publisher) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // 1️⃣ Create comic FIRST and ALWAYS return it
  const { data: comic, error: comicError } = await supabase
    .from("comics")
    .insert({
      series_title,
      issue_number,
      publisher,
      release_year: release_year ? Number(release_year) : null,
    })
    .select()
    .single();

  if (comicError) {
    console.error("Comic insert failed:", comicError);
    return NextResponse.json(
      { error: "Failed to create comic" },
      { status: 500 }
    );
  }

  // 2️⃣ Best-effort cover upload (never blocks response)
  if (coverFile && coverFile.size > 0) {
    try {
      const path = `${comic.id}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("comic-covers")
        .upload(path, coverFile, { upsert: true });

      if (!uploadError) {
        await supabase.from("comic_covers").insert({
          comic_id: comic.id,
          image_path: path,
          is_primary: true,
        });
      } else {
        console.warn("Cover upload failed:", uploadError);
      }
    } catch (err) {
      console.warn("Cover handling crashed:", err);
    }
  }

  // ✅ ALWAYS return comic
  return NextResponse.json({ comic }, { status: 201 });
}

