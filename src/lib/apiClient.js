"use client";
import { getSupabaseClient } from "./supabase/client";

// Attaches the current session's access token as a Bearer header so API
// routes can verify identity server-side (see src/lib/authServer.js) instead
// of trusting a client-supplied user_id. Works for both JSON and FormData
// bodies — it only adds a header, never touches the body or Content-Type.
export async function authedFetch(url, options = {}) {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers || {});
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(url, { ...options, headers });
}
