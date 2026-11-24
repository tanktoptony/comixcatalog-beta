// Admin endpoint: flip a user's is_pro or is_patron (Patreon badge) flag.
// Gated by requireAdmin (admin account + two-factor). Used by the /admin tool to grant or revoke
// comped Pro memberships (Founding Collectors carry-over,
// test accounts, comps, etc.).

import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const { target_username, is_pro, is_patron } = body;

  if (!target_username || typeof target_username !== "string") {
    return NextResponse.json({ error: "Missing target_username" }, { status: 400 });
  }
  // One flag per request: is_pro (comped Pro) or is_patron (Patreon badge).
  const field = typeof is_pro === "boolean" ? "is_pro" : typeof is_patron === "boolean" ? "is_patron" : null;
  if (!field) {
    return NextResponse.json({ error: "is_pro or is_patron must be boolean" }, { status: 400 });
  }
  const value = field === "is_pro" ? is_pro : is_patron;

  const supabase = getServiceClient();
  const { data: profile, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, username, is_pro, is_patron")
    .eq("username", target_username)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: `No user with username "${target_username}"` }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ [field]: value })
    .eq("id", profile.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: profile.id, username: profile.username, is_pro: profile.is_pro, is_patron: profile.is_patron, [field]: value },
    previous_is_pro: profile.is_pro,
    previous_is_patron: profile.is_patron,
  });
}

// GET — look up current state without modifying. UI uses this to fetch
// before showing the toggle so the admin sees the right starting state.
export async function GET(req) {
  const { response } = await requireAdmin(req);
  if (response) return response;

  const url = new URL(req.url);
  const target_username = url.searchParams.get("username");

  if (!target_username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, is_pro, is_patron, is_founding_collector, stripe_customer_id, created_at")
    .eq("username", target_username)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ user: profile });
}
