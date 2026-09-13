import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client for API routes and route handlers.
//
// FIXED (2026-09): this previously called `cookies()` from `next/headers`
// synchronously and read a "sb-access-token" cookie. Two separate problems:
//   1. Next 16 made `cookies()` return a Promise — the un-awaited call threw
//      `TypeError: cookieStore.get is not a function` on every invocation,
//      confirmed live via /api/account/delete returning 500 "Could not read
//      session."
//   2. Even with the await fixed, that cookie was never real: the browser
//      client (src/lib/supabase/client.js) persists sessions in
//      localStorage via plain @supabase/supabase-js, not cookies. No code
//      anywhere ever sets "sb-access-token", so the lookup would always be
//      undefined and every server-side identity check would silently fail
//      auth regardless of the crash fix.
//
// Fix: callers that need to identify the calling user must forward that
// user's access token explicitly (e.g. an `Authorization: Bearer <token>`
// header sent from the client, which already holds the token via
// supabase.auth.getSession()) and pass it in here. Callers that don't need
// to identify anyone up front — like the OAuth/email-confirmation callback,
// which establishes a brand-new session on this same client instance via
// exchangeCodeForSession() — can call this with no argument.
export function supabaseServer(accessToken) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : undefined
  );
}
