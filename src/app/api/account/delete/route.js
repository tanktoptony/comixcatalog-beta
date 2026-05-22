// POST /api/account/delete — deletes the current user's account.
//
// Why server-side: removing an auth.users row requires the service_role key,
// which we can't expose to the browser. The flow:
//   1. Read the caller's session cookie via supabaseServer().
//   2. Get their user.id (the only ID we need — they can only delete themselves).
//   3. Service-role client deletes:
//        - the profile row (cascades to comic_covers if FK exists)
//        - user_collections rows (no auth.users FK with ON DELETE CASCADE
//          configured, so we delete explicitly)
//        - covers they uploaded under library/<collection_id>.* (best-effort)
//        - finally, the auth.users row itself
//   4. Caller is signed out client-side after the response returns.
//
// We intentionally tolerate partial failures (logged, not surfaced) for the
// non-critical sub-deletes. The hard requirement is that auth.users goes
// away; once that happens the user has no way to log back in and the
// remaining rows are orphans that a sweep job can clean up later.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST() {
  let userId = null;
  try {
    const supabase = supabaseServer();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

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
