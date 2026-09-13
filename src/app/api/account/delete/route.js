// POST /api/account/delete — deletes the current user's account.
//
// Why server-side: removing an auth.users row requires the service_role key,
// which we can't expose to the browser. The flow:
//   1. Read the caller's access token, forwarded explicitly in the
//      Authorization header (see src/lib/supabase/server.js — there is no
//      session cookie to read it from).
//   2. Get their user.id (the only ID we need — they can only delete themselves).
//   3. Service-role client deletes, in FK-safe order:
//        - user_collections (references comics.id and auth.users.id)
//        - comic_covers they uploaded, AND comic_covers on comics they
//          created (references comics.id and auth.users.id) — added
//          2026-09-13 after a live repro: a CSV-imported local `comics` row
//          left `auth.admin.deleteUser()` failing with an opaque "Database
//          error deleting user" (a naked FK violation), so the account
//          could never actually be deleted once a user had added so much as
//          one local/manual comic. See comics cleanup below.
//        - comics they created (created_by) — same FK reason
//        - the profile row
//        - finally, the auth.users row itself
//   4. Caller is signed out client-side after the response returns.
//
// We intentionally tolerate partial failures (logged, not surfaced) for the
// non-critical sub-deletes. The hard requirement is that auth.users goes
// away; once that happens the user has no way to log back in and the
// remaining rows are orphans that a sweep job can clean up later. comics/
// comic_covers are deleted up front specifically because leaving them
// behind is what breaks that hard requirement, not because they're
// non-critical.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request) {
  let userId = null;
  try {
    // supabaseServer() has no cookie to read the caller's session from (see
    // its comment) — the client must forward its access token explicitly.
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const supabase = supabaseServer(token);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }
    userId = user.id;
  } catch (err) {
    console.error("delete-account: session read failed:", err);
    return NextResponse.json(
      { error: "Could not read session." },
      { status: 500 }
    );
  }

  // Service-role client for the destructive operations.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Best-effort: delete user_collections (they reference auth.users but we
  // don't trust the FK cascade is in place across all environments).
  try {
    await admin.from("user_collections").delete().eq("user_id", userId);
  } catch (err) {
    console.warn(`delete-account: collection cleanup failed for ${userId}:`, err);
  }

  // comics rows this user created (via "+ Add manually" or a CSV import)
  // FK-reference auth.users.id via created_by, and comic_covers FK-reference
  // both comics.id and auth.users.id (uploaded_by) — either left behind
  // makes the auth.users delete below fail outright. Delete comic_covers
  // first (both by upload ownership and by owning comic), then the comics
  // rows themselves.
  try {
    const { data: ownComics } = await admin
      .from("comics")
      .select("id")
      .eq("created_by", userId);
    const ownComicIds = (ownComics ?? []).map((c) => c.id);

    await admin.from("comic_covers").delete().eq("uploaded_by", userId);
    if (ownComicIds.length > 0) {
      await admin.from("comic_covers").delete().in("comic_id", ownComicIds);
    }
    await admin.from("comics").delete().eq("created_by", userId);
  } catch (err) {
    console.warn(`delete-account: comics/comic_covers cleanup failed for ${userId}:`, err);
  }

  // Best-effort: delete uploaded library covers under comic-covers/library/<collection_id>.*
  // (We don't track per-file ownership, so we'd need to enumerate; skipping
  // bulk-storage cleanup for v1 — orphans can be swept later by a cron.)

  // Profile row — has FK to auth.users.id, so deletion order matters in some
  // configurations. Delete profile FIRST, then auth row.
  try {
    await admin.from("profiles").delete().eq("id", userId);
  } catch (err) {
    console.warn(`delete-account: profile delete failed for ${userId}:`, err);
  }

  // The hard requirement: remove the auth.users row.
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    console.error(`delete-account: auth.users delete failed for ${userId}:`, authError);
    return NextResponse.json(
      { error: authError.message ?? "Could not delete account." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
