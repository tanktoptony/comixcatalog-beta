import { createClient } from "@supabase/supabase-js";

// Verifies the caller's Supabase access token against Supabase's auth
// server. Every API route that needs to know "who is making this request"
// must go through this — never trust a client-supplied user_id/actor_id in
// a request body or query string, since that's trivially spoofable (see
// docs/data-hardening-and-growth-spec.md security addendum, 2026-08-01).
//
// Client side: send the current session's access_token as
// `Authorization: Bearer <token>` — see src/lib/apiClient.js's authedFetch().
//
// supabase.auth.getUser(token) does a real network round-trip to Supabase's
// auth server to validate the token — it is NOT just decoding the JWT
// locally, so an expired/forged/tampered token is correctly rejected.
export async function getAuthedUser(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
