// src/lib/launchFlags.js
//
// Single source of truth for launch-window promotional behavior.

"use client";

// AUTO_PRO_AND_FOUNDING_ON_SIGNUP
// When true, a new signup is offered a founding pass — Pro for free —
// PROVIDED one of the 100 is still unclaimed. Set false to send new accounts
// straight to the normal Pro upsell. Existing users are unaffected either
// way; flip individual rows in `profiles` to change someone retroactively.
//
// Why we have this: during the launch push the marketing creative implies a
// fully-loaded product, and a new signup landing in a hobbled free tier
// bounces.
//
// WHAT CHANGED 2026-09-24, and why it mattered:
//
// This used to hand back `{ is_pro: true, is_founding_collector: true }` for
// the client to stamp onto its own profile row, unconditionally. Two
// problems, both live:
//
//   1. The 100-pass cap was never enforced on this path. /api/founding/status
//      caps claims at 100 and reports how many remain, but that guard only
//      covered the manual claim button. Automatic signup ignored it, so
//      signup 101 and signup 500 would both have taken a founding pass and
//      the badge. "100 founding passes" was not true of the route that
//      essentially everyone uses.
//
//   2. The flag's own exit condition could never be met. The comment said to
//      flip it "once we have real active users + Stripe customers" — but no
//      one can become a Stripe customer while every signup is handed Pro for
//      free. It was a condition that could only be satisfied by ignoring it.
//      The cap is the condition that can actually fire: when the hundredth
//      pass goes, new signups start seeing the paywall on their own, with no
//      one needing to remember a boolean.
//
// Measured the same day: 27 profiles, 27 is_pro, 27 founding, and 0 that had
// ever reached Stripe checkout. Revenue was not converting badly; it had
// never been offered.
export const AUTO_PRO_AND_FOUNDING_ON_SIGNUP = true;

// Deliberately returns nothing now.
//
// The flags are no longer the client's to set. A browser deciding its own
// entitlements is the wrong shape regardless of RLS, and it is also what
// made the cap unenforceable — the client had no trustworthy way to know how
// many passes were left, and checking would have raced anyway.
//
// Kept as an exported no-op rather than deleted so the two signup surfaces
// still read in lockstep and a stale import cannot silently reintroduce the
// old behaviour. Remove it once both call sites are known to be clean.
export function launchProfileFlags() {
  return {};
}

// Ask the server for a founding pass. Call AFTER the profile row exists.
//
// The cap lives in /api/founding/status, which counts claimed passes with
// the service role and refuses past 100. Failure here is deliberately not
// fatal: the account is already created and usable, it simply stays on the
// free tier, which is the correct outcome when the passes have run out. A
// network blip therefore costs someone a promo, never their signup.
//
// Returns { claimed, remaining } so a caller can say something useful.
//
// `fetcher` is injectable purely so this can be tested without a browser,
// a session or a running server. Production passes nothing and gets
// authedFetch, which is imported lazily: a static import would drag
// apiClient -> supabase/client into any plain-node context that merely
// imports this module, and those use extensionless specifiers that only
// Next's resolver understands.
export async function claimFoundingPass(fetcher) {
  if (!AUTO_PRO_AND_FOUNDING_ON_SIGNUP) return { claimed: false, remaining: 0 };
  try {
    const call = fetcher ?? (await import("./apiClient.js")).authedFetch;
    const res = await call("/api/founding/status", { method: "POST" });
    if (!res.ok) {
      // 409 is the expected, non-exceptional "all passes claimed".
      return { claimed: false, remaining: 0 };
    }
    const body = await res.json();
    return { claimed: Boolean(body?.ok), remaining: Number(body?.remaining ?? 0) };
  } catch {
    return { claimed: false, remaining: 0 };
  }
}
