import { SITE_URL } from "@/lib/siteUrl";

// Server-side read of how many founding passes are left, shared by the root
// layout (FoundingBanner) and /start. Moved out of layout.js unchanged.
//
// Server-rendered so the founding-collector count is correct on first paint
// instead of flashing a stale guess before a client fetch corrects it (bug
// found 2026-08-27 — FoundingBanner used to seed useState with a hardcoded
// 83, so every visitor briefly saw a wrong "spots remaining" number before
// it self-corrected). cache: "no-store" forces the caller to render
// per-request rather than being statically frozen at build/deploy time.
//
// null means "don't know", and callers must hide the offer rather than
// guess a number.
export async function getFoundingRemaining() {
  try {
    const res = await fetch(`${SITE_URL}/api/founding/status`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return Number.isFinite(data?.remaining) ? data.remaining : null;
  } catch {
    return null;
  }
}
