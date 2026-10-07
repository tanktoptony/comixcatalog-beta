import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/authServer";
import { ADMIN_ID } from "@/lib/admin";
import { canSeeComic } from "@/lib/review";

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
    const authedUser = await getAuthedUser(req);
    const supabase = getServiceClient();

    const { data: comic, error: comicError } = await supabase
      .from("comics")
      .select(`
        id,
        series_title,
        publisher,
        issue_number,
        release_year,
        created_by,
        review_status,
        comic_covers (
          image_path,
          is_primary
        )
      `)
      .eq("id", id)
      .single();

    if (comicError || !comic || !canSeeComic(comic, authedUser?.id, ADMIN_ID)) {
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

    const supabase = getServiceClient();
    const body = await req.json();
    const { series_title, issue_number, publisher, release_year } = body;

    // Verify ownership
    const { data: existing, error: ownershipError } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .maybeSingle(); // zero rows is an answer, not a failure

    if (ownershipError) {
      console.error("comic ownership lookup failed:", ownershipError.code, ownershipError.message);
      return NextResponse.json({ error: "Failed to verify comic ownership" }, { status: 502 });
    }

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

    const supabase = getServiceClient();

    // Verify ownership
    const { data: existing, error: ownershipError } = await supabase
      .from("comics")
      .select("created_by")
      .eq("id", id)
      .maybeSingle(); // zero rows is an answer, not a failure

    if (ownershipError) {
      console.error("comic ownership lookup failed:", ownershipError.code, ownershipError.message);
      return NextResponse.json({ error: "Failed to verify comic ownership" }, { status: 502 });
    }

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
