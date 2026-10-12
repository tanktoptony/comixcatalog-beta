// Shorts and Reels cut from episode timelines. Ranges are script phrases.
// They use each segment's `beat`, so they follow narration timing.
// Keep each under 60 s. Render: node scripts/render-shorts.mjs

export const END_CARD = 2.6;

export const SHORTS = [
  {
    id: "Short001Colossus",
    episode: "episode-001-v3",
    fromBeat: "My best friend is the one who got us all into it",
    toBeat: "The obvious move is to start at the beginning",
    hook: "I didn't pick my favorite X-Man",
  },
  {
    id: "Short001NotNumberOne",
    episode: "episode-001-v3",
    fromBeat: "The obvious move is to start at the beginning",
    toBeat: "Number one The Dark Phoenix Saga",
    hook: "Don't start X-Men at #1",
  },
  {
    id: "Short001ShopLikeAKid",
    episode: "episode-001-v3",
    fromBeat: "Here's my actual advice",
    toBeat: "Quick one I built ComixCatalog",
    hook: "How to actually get into comics",
  },
  {
    id: "Short002WhoWroteThis",
    episode: "episode-002",
    fromBeat: "I've been collecting comics for most of my life",
    toBeat: "So that got me thinking",
    // "Hickman." ends at 55.0 s voice time and "So" starts at 55.42; end in that pause.
    endNudge: 0.62,
    hook: "Hickman wrote these?!",
  },
  {
    id: "Short002ManhattanProjects",
    episode: "episode-002",
    fromBeat: "You know the real Manhattan Project",
    toBeat: "And then there's the art",
    hook: "The bomb was the boring part",
  },
  {
    id: "Short002EastOfWest",
    episode: "episode-002",
    fromBeat: "science fiction western",
    toBeat: "a prophecy called the Message",
    // The anchor is mid-sentence ("On top of that, there's a prophecy...").
    // End after "...what that is." (351.74 s voice time), before "On" (352.36).
    endNudge: -0.93,
    hook: "A comet ended the Civil War",
  },
  {
    id: "Short003DiscogsForComics",
    episode: "episode-003",
    fromBeat: "If you've never used discogs",
    toBeat: "Hold on to that",
    endNudge: -0.18,
    hook: "Discogs started as one guy's record collection",
  },
  {
    id: "Short003MilkAndCheese",
    episode: "episode-003",
    fromBeat: "Milk and Cheese by Evan Dorkin",
    toBeat: "Scud the Disposable Assassin",
    endNudge: 0.13,
    hook: "The comic with two number ones",
  },
  {
    id: "Short003ScudVendingMachine",
    episode: "episode-003",
    fromBeat: "Scud the Disposable Assassin",
    toBeat: "And Malibu Malibu Comics",
    // The default 0.3 s lead-in starts inside "...90s vibe." (audible to 310.98 s); "Scud" begins at 311.20, so start at 311.05 in the silence between them.
    startNudge: 0.47,
    endNudge: 0.125,
    hook: "Your assassin comes from a vending machine",
  },
];

// Seconds of each clip. The clip stops just before the next beat.
// This keeps the next section's narration out. The composition
// adds END_CARD seconds for the "full video" card.
export function shortRange(ep, s) {
  const at = (beat) => ep.segments.find((x) => x.beat === beat)?.at;
  const from = at(s.fromBeat);
  const to = at(s.toBeat);
  if (from == null || to == null) throw new Error(`${s.id}: beat not found in ${ep.id}`);
  // startNudge (seconds) moves the start when the default lead-in includes unwanted audio.
  // endNudge (seconds) moves the end when the next beat's anchor sits too
  // close to, or past, the last word this Short should keep.
  return { from: Math.max(0, from - 0.3 + (s.startNudge ?? 0)), to: to - 0.15 + (s.endNudge ?? 0) };
}
