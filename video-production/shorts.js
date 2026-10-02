// Shorts / Reels cut from Episode 001 V3. Ranges are script phrases (the
// `beat` of a V3 segment), so they follow the narration when it's re-timed.
// Keep each under 60 s. Render: node scripts/render-shorts.mjs

export const END_CARD = 2.6;

export const SHORTS = [
  {
    id: "Short001Colossus",
    fromBeat: "My best friend is the one who got us all into it",
    toBeat: "The obvious move is to start at the beginning",
    hook: "I didn't pick my favorite X-Man",
  },
  {
    id: "Short001NotNumberOne",
    fromBeat: "The obvious move is to start at the beginning",
    toBeat: "Number one The Dark Phoenix Saga",
    hook: "Don't start X-Men at #1",
  },
  {
    id: "Short001ShopLikeAKid",
    fromBeat: "Here's my actual advice",
    toBeat: "Quick one I built ComixCatalog",
    hook: "How to actually get into comics",
  },
];

// Seconds of each clip, from the V3 segments. The clip stops just before
// the next beat (so no next-section narration bleeds in); the composition
// adds END_CARD seconds for the "full video" card.
export function shortRange(ep, s) {
  const at = (beat) => ep.segments.find((x) => x.beat === beat)?.at;
  const from = at(s.fromBeat);
  const to = at(s.toBeat);
  if (from == null || to == null) throw new Error(`${s.id}: beat not found in ${ep.id}`);
  return { from: Math.max(0, from - 0.3), to: to - 0.15 };
}
