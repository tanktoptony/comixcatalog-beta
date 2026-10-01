import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// Server-side read of how many founding passes are left, shared by the root
// layout (FoundingBanner) and /start.
//
// Server-rendered so the founding-collector count is correct on first paint
// instead of flashing a stale guess before a client fetch corrects it (bug
// found 2026-08-27 — FoundingBanner used to seed useState with a hardcoded
// 83, so every visitor briefly saw a wrong "spots remaining" number before
// it self-corrected).
//
// 2026-10-01: this used to fetch our own /api/founding/status with
// cache: "no-store" from the ROOT LAYOUT, so every page render on the site
// paid an extra serverless round trip plus a profiles count, and no page
// could ever be served from cache. It now counts directly, cached for 60 s:
// still a real number on first paint, and FoundingBanner refreshes it on
// the client anyway.
//
// null means "don't know", and callers must hide the offer rather than
// guess a number.

const CAP = 100;

const countFoundingClaims = unstable_cache(
  async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_founding_collector", true);
    // Throw rather than return a guess: unstable_cache does not store a
    // rejected call, so one failed count is not frozen in for a minute.
    if (error) throw error;
    return Number(count) || 0;
  },
  ["founding-claims-v1"],
  { revalidate: 60 }
);

export async function getFoundingRemaining() {
  try {
    const claimed = await countFoundingClaims();
    return Math.max(0, CAP - claimed);
  } catch (error) {
    console.error("getFoundingRemaining failed:", error);
    return null;
  }
}
