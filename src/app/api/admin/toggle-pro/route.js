// Admin endpoint: flip a user's is_pro flag.
// Gated by ADMIN_ID. Used by the /admin tool to grant or revoke
// comped Pro memberships (Founding Collectors carry-over,
// test accounts, comps, etc.).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_ID } from "@/lib/admin";

export const dynamic = "force-dynamic";

function srv() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const { actor_id, target_username, is_pro } = body;

  if (!actor_id || actor_id !== ADMIN_ID) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!target_username || typeof target_username !== "string") {
    return NextResponse.json({ error: "Missing target_username" }, { status: 400 });
  }
  if (typeof is_pro !== "boolean") {
    return NextResponse.json({ error: "is_pro must be boolean" }, { status: 400 });
  }

  const supabase = srv();
  const { data: profile, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, username, is_pro")
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
    .update({ is_pro })
    .eq("id", profile.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    user: { id: profile.id, username: profile.username, is_pro },
    previous_is_pro: profile.is_pro,
  });
}

// GET — look up current state without modifying. UI uses this to fetch
// before showing the toggle so the admin sees the right starting state.
export async function GET(req) {
  const url = new URL(req.url);
  const actor_id = url.searchParams.get("actor_id");
  const target_username = url.searchParams.get("username");

  if (!actor_id || actor_id !== ADMIN_ID) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  if (!target_username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const supabase = srv();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, is_pro, is_founding_collector, stripe_customer_id, created_at")
    .eq("username", target_username)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ user: profile });
}
