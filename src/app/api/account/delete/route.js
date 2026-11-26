// POST /api/account/delete — deletes the current user's account.
//
// Why server-side: removing an auth.users row requires the service_role key,
// which we can't expose to the browser. The flow:
//   1. Read the caller's access token, forwarded explicitly in the
//      Authorization header (see src/lib/supabase/server.js — there is no
//      session cookie to read it from).
//   2. Get their user.id (the only ID we need — they can only delete themselves).
//   3. Refuse deletion while marketplace orders, payouts, or disputes are open.
//   4. Service-role client deletes, in FK-safe order:
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
//   5. Caller is signed out client-side after the response returns.
//
// Every database error stops the sequence before auth.users is removed. A
// partial cleanup is repairable; deleting the login while owned rows remain
// is not.

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { supabaseServer } from "@/lib/supabase/server";
import { accountDeletionDecision } from "@/lib/accountDeletion";

const OPEN_ORDER_STATUSES = [
  "created",
  "awaiting_payment",
  "paid",
  "shipped",
  "delivered",
  "disputed",
];

function databaseFailure(userId, operation, error) {
  console.error(`delete-account: ${operation} failed for ${userId}:`, error);
  return NextResponse.json({ error: "Could not delete account." }, { status: 500 });
}

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
  const admin = getServiceClient();

  // These reads must all finish before the first mutation. Orders use
  // buyer_id/seller_id and transfer state from migration 0066; disputes use
  // order_disputes.status from migration 0073.
  let obligationResults;
  try {
    obligationResults = await Promise.all([
      admin
        .from("orders")
        .select("status")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .in("status", OPEN_ORDER_STATUSES)
        .limit(1),
      admin
        .from("orders")
        .select("id")
        .eq("seller_id", userId)
        .eq("status", "completed")
        .is("stripe_transfer_id", null)
        .is("transferred_at", null)
        .not("stripe_charge_id", "is", null)
        .gt("seller_net_cents", 0)
        .limit(1),
      admin
        .from("order_disputes")
        .select("id,orders!inner(buyer_id,seller_id)")
        .eq("status", "open")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`, { referencedTable: "orders" })
        .limit(1),
      admin
        .from("orders")
        .select("id")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .limit(1),
      admin
        .from("seller_accounts")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1),
      admin
        .from("order_email_log")
        .select("order_id")
        .eq("recipient_id", userId)
        .limit(1),
      admin
        .from("order_feedback")
        .select("order_id")
        .or(`subject_id.eq.${userId},author_id.eq.${userId},removed_by.eq.${userId}`)
        .limit(1),
    ]);
  } catch (err) {
    obligationResults = [{ error: err }];
  }

  const [
    openOrdersResult = {},
    transfersResult = {},
    disputesResult = {},
    ordersResult = {},
    sellerAccountsResult = {},
    orderEmailLogsResult = {},
    orderFeedbackResult = {},
  ] = obligationResults;
  const obligationError = obligationResults.find((result) => result?.error)?.error;
  const decision = accountDeletionDecision({
    openOrders: openOrdersResult.data,
    unpaidTransfers: transfersResult.data,
    openDisputes: disputesResult.data,
    orders: ordersResult.data,
    sellerAccounts: sellerAccountsResult.data,
    orderEmailLogs: orderEmailLogsResult.data,
    orderFeedback: orderFeedbackResult.data,
    checkError: obligationError,
  });
  if (!decision.allowed) {
    if (obligationError) {
      console.error(`delete-account: marketplace obligation check failed for ${userId}:`, obligationError);
    }
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  // Delete user_collections first because they reference both auth.users and
  // comics. Do not continue to auth deletion if Supabase returns an error.
  try {
    const { error } = await admin.from("user_collections").delete().eq("user_id", userId);
    if (error) return databaseFailure(userId, "collection cleanup", error);
  } catch (err) {
    return databaseFailure(userId, "collection cleanup", err);
  }

  // comics rows this user created (via "+ Add manually" or a CSV import)
  // FK-reference auth.users.id via created_by, and comic_covers FK-reference
  // both comics.id and auth.users.id (uploaded_by) — either left behind
  // makes the auth.users delete below fail outright. Delete comic_covers
  // first (both by upload ownership and by owning comic), then the comics
  // rows themselves.
  try {
    const { data: ownComics, error: ownComicsError } = await admin
      .from("comics")
      .select("id")
      .eq("created_by", userId);
    if (ownComicsError) return databaseFailure(userId, "comic lookup", ownComicsError);
    const ownComicIds = (ownComics ?? []).map((c) => c.id);

    const { error: uploadedCoverError } = await admin.from("comic_covers").delete().eq("uploaded_by", userId);
    if (uploadedCoverError) return databaseFailure(userId, "uploaded cover cleanup", uploadedCoverError);
    if (ownComicIds.length > 0) {
      const { error: comicCoverError } = await admin.from("comic_covers").delete().in("comic_id", ownComicIds);
      if (comicCoverError) return databaseFailure(userId, "comic cover cleanup", comicCoverError);
    }
    const { error: comicsError } = await admin.from("comics").delete().eq("created_by", userId);
    if (comicsError) return databaseFailure(userId, "comic cleanup", comicsError);
  } catch (err) {
    return databaseFailure(userId, "comics/comic_covers cleanup", err);
  }

  // Best-effort: delete uploaded library covers under comic-covers/library/<collection_id>.*
  // (We don't track per-file ownership, so we'd need to enumerate; skipping
  // bulk-storage cleanup for v1 — orphans can be swept later by a cron.)

  // Profile row — has FK to auth.users.id, so deletion order matters in some
  // configurations. Delete profile FIRST, then auth row.
  try {
    const { error } = await admin.from("profiles").delete().eq("id", userId);
    if (error) return databaseFailure(userId, "profile delete", error);
  } catch (err) {
    return databaseFailure(userId, "profile delete", err);
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
