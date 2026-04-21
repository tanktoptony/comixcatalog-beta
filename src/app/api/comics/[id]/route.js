import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function parseYear(value) {
  if (!value) return null;
  const match = String(value).match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

// GET /api/comics/[id]
export async function GET(req, context) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();

    // Handle GCD issues (prefixed with "gcd-")
    if (String(id).startsWith("gcd-")) {
      const gcdId = String(id).replace(/^gcd-/, "");

      const { data: issue, error } = await supabase
        .from("gcd_issues")
        .select(`
          gcd_id,
          series_gcd_id,
          publisher_gcd_id,
          issue_number,
          title,
          publication_date
        `)
        .eq("gcd_id", gcdId)
        .single();

      if (error || !issue) {
        return NextResponse.json({ error: "Issue not found" }, { status: 404 });
      }

      const [seriesResult, gcdPublisherResult] = await Promise.all([
        supabase
          .from("series")
          .select("id, title, publisher:publisher_id(id, name)")
          .eq("gcd_id", issue.series_gcd_id)
          .single(),
        issue.publisher_gcd_id
          ? supabase
              .from("gcd_publishers")
              .select("name")
              .eq("gcd_id", issue.publisher_gcd_id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      const seriesRow = seriesResult.data;
      const seriesTitle = seriesRow?.title ?? issue.title ?? null;
      const publisherName =
        seriesRow?.publisher?.name ??
        gcdPublisherResult.data?.name ??
        null;

      // Resolve cover
      let cover = null;
      if (seriesTitle && issue.issue_number != null) {
        const { data: canonicalRows } = await supabase
          .from("canonical_covers")
          .select("storage_path")
          .eq("series_title", seriesTitle)
          .eq("issue_number", issue.issue_number)
          .not("storage_path", "is", null)
          .limit(1);

        const storagePath = canonicalRows?.[0]?.storage_path ?? null;
        if (storagePath) {
          cover = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${storagePath}`;
        }
      }

      return NextResponse.json({
        issue: {
          id: `gcd-${issue.gcd_id}`,
          source: "gcd",
          series_id: seriesRow?.id ?? null,
          series_title: seriesTitle,
          issue_number: issue.issue_number,
          release_year: parseYear(issue.publication_date),
          publication_date: issue.publication_date ?? null,
          publisher: publisherName,
          cover,
          created_by: null,
        },
      });
    }

    // Handle user-added comics (UUID)
    const { data: comic, error: comicError } = await supabase
      .from("comics")
      .select(`
        id,
        series_title,
        publisher,
        issue_number,
        release_year,
        created_by,
        comic_covers (
          image_path,
          is_primary
        )
      `)
      .eq("id", id)
      .single();

    if (comicError || !comic) {
      return NextResponse.json({ error: "Comic not found" }, { status: 404 });
    }

    const coverPath =
      comic.comic_covers?.find((c) => c.is_primary)?.image_path ?? null;

    return NextResponse.json({
      issue: {
        id: comic.id,
        source: "user",
        series_title: comic.series_title ?? null,
        issue_number: comic.issue_number ?? null,
        release_year: comic.release_year ?? null,
        publisher: comic.publisher ?? null,
        cover: coverPath
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${coverPath}`
          : null,
        created_by: comic.created_by ?? null,
      },
    });
  } catch (err) {
    console.error("GET /api/comics/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/comics/[id]
export async function PATCH(req, context) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();
    const body = await req.json();
    const { series_title, issue_number, publisher, release_year, user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!existing || existing.created_by !== user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("comics")
      .update({
        series_title,
        issue_number,
        publisher,
        release_year: release_year ? Number(release_year) : null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comic: data });
  } catch (err) {
    console.error("PATCH /api/comics/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/comics/[id]
export async function DELETE(req, context) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();
    const body = await req.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const { data: existing } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!existing || existing.created_by !== user_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("comics")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/comics/[id] crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}