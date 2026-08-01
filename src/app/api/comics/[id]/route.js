import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/authServer";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// GET /api/comics/[id]
//
// Serves user-contributed comics only (UUID ids). GCD issues are served by
// /api/issues/[id] — every link in the app (search, header autocomplete,
// library, public profile, series page) routes a gcd-prefixed id to /issue/[id],
// never here. A previous gcd- branch lived in this route as a stale duplicate of
// /api/issues/[id]; it was unreachable and drifted out of sync (no key_date
// fallback, ignored resolved_publisher_cached, no span-gated cover match), so it
// was removed. Don't reintroduce a gcd path here — extend /api/issues/[id].
export async function GET(req, context) {
  try {
    const { id } = await context.params;
    const supabase = getSupabase();

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
    const authedUser = await getAuthedUser(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();
    const body = await req.json();
    const { series_title, issue_number, publisher, release_year } = body;

    // Verify ownership
    const { data: existing } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!existing || existing.created_by !== authedUser.id) {
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
    const authedUser = await getAuthedUser(req);
    if (!authedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabase();

    // Verify ownership
    const { data: existing } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .single();

    if (!existing || existing.created_by !== authedUser.id) {
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
