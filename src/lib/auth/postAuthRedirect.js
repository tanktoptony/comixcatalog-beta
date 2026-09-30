"use client";

// Where to send someone the moment they become logged in.
//
// This exists because `router.replace(path)` followed immediately by
// `router.refresh()` is wrong here, and was losing logins in production.
//
// What went wrong (reported 2026-09-24): signing in left the user sitting on
// /login with their auth state already changed. `router.refresh()` re-fetches
// the RSC payload for the route you are on *now*, which at that instant is
// still /login, and it competes with the navigation `replace()` just started.
// When refresh wins, the navigation is dropped and you stay put — logged in,
// on the login form, with nothing to indicate anything happened. The slower
// the destination, the wider the window: /u/<user> for a 326-book collection
// was taking 7.6s to render, which made a rare race close to reliable.
//
// Why `refresh()` cannot help us anyway. getSupabaseClient() builds a plain
// @supabase/supabase-js browser client, so the session lives in localStorage,
// not in a cookie. The server sees no session no matter when it re-renders.
// So `refresh()` here buys nothing and costs a race — the worst trade
// available.
//
// Why a hard navigation rather than just dropping the refresh(). A full load
// makes AuthContext re-seed from the stored session on mount (it has an
// explicit initial seed for exactly this), so the header, avatar and every
// gated control are correct on arrival. It costs one page load on a
// once-per-session transition, which is the right price for a login that
// always lands.
//
// The real fix is migrating auth to @supabase/ssr so the session is a cookie
// the server can read. That is tracked and deliberately deferred; this makes
// the current architecture behave correctly in the meantime, and it should be
// removed when that migration lands.
export function redirectAfterAuth(path) {
  if (typeof window === "undefined") return;
  window.location.assign(safeNextPath(path) ?? "/");
}

// The one open-redirect guard for a post-auth destination, shared by /login,
// /signup and /auth/callback. Returns the path when it is same-origin, else
// null. "//host" and "/\host" are both rejected: browsers normalise a
// backslash to a slash, so "/\evil.example" navigates off-site exactly like
// "//evil.example" does, and a bare startsWith("//") check misses it.
export function safeNextPath(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  if (!raw.startsWith("/")) return null;
  if (raw[1] === "/" || raw[1] === "\\") return null;
  // URL parsing strips tabs and newlines, so "/<TAB>/evil" collapses to
  // "//evil". Refuse any control character outright.
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  return raw;
}
