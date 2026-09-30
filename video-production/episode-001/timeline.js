// Episode 001: "Where to Start Reading X-Men Without Losing Your Mind"
//
// Transcribed from episode001_visual_edit_blueprint.md (kept beside this
// file). Every `at` is the blueprint's timestamp; `note` quotes or cites the
// blueprint line a segment implements. Where the blueprint left a choice
// open, the note says what was chosen.
//
// Blueprint filenames carry a "-1" suffix (x-men-129-1980-1.jpg); the covers
// on disk are the same books without it (covers/x-men-129-1980.jpg).
//
// Assets under extras/, stock/ and screenshots/ are named without extensions
// so whatever arrives (.jpg, .png, .mp4) is used. Anything absent renders as a
// [MISSING: ...] card and is listed in output/episode-001-missing-assets.json.
//
// Retime against the final narration with `nudges`, e.g.
//   nudges: [{ from: "6:10", by: 1.5 }]

const cv = (name) => `covers/${name}.jpg`;
const X = {
  x1: cv("x-men-001-1963"),
  x129: cv("x-men-129-1980"),
  x130: cv("x-men-130-1980"),
  x135: cv("x-men-135-1980"),
  x136: cv("x-men-136-1980"),
  x137: cv("x-men-137-1980"),
  x141: cv("x-men-141-1981"),
  u142: cv("uncanny-x-men-142-1981"),
  u266: cv("uncanny-x-men-266-1990"),
  x14: cv("x-men-014-1992"),
  x15: cv("x-men-015-1992"),
  x16: cv("x-men-016-1993"),
  hom1: cv("house-of-m-001-2005"),
  hom8: cv("house-of-m-008-2005"),
  hox1: cv("house-of-x-001-2019"),
  hox6: cv("house-of-x-006-2019"),
  pox1: cv("powers-of-x-001-2019"),
  pox6: cv("powers-of-x-006-2019"),
};
const ALL_18 = [X.x1, X.x129, X.x130, X.x135, X.x136, X.x137, X.x141, X.u142, X.u266, X.x14, X.x15, X.x16, X.hom1, X.hom8, X.hox1, X.hox6, X.pox1, X.pox6];
const DARK_PHOENIX = [X.x129, X.x130, X.x135, X.x136, X.x137];
const HOXPOX = [X.hox1, X.pox1, X.hox6, X.pox6];

// Optional animated beats. Drop a GIF (or MP4) with this name into
// extras/ and it replaces the still; until then the still plays. Kept to
// four beats: the blueprint says animation must support a specific line.
const GIF = {
  // The 1992 opening titles (4s, 320x240, 4:3). Shown 4:3 between pillars.
  intro: "extras/GIF_TAS_INTRO_END.mp4",
  gambit: "extras/GIF_GAMBIT_CARDS",
  phoenix: "extras/GIF_PHOENIX",
  sentinel: "extras/GIF_SENTINEL",
};

const TAS = {
  team: "extras/TAS_TEAM_1992",
  jubileeSentinel: "extras/TAS_JUBILEE_SENTINEL",
  // No solo Gambit still exists on Marvel.com; the Gambit shots frame him
  // within the official Rogue & Gambit screenshot instead (GAMBIT_FRAME).
  gambit: "extras/TAS_GAMBIT_ROGUE",
  gambitRogue: "extras/TAS_GAMBIT_ROGUE",
  wolverine: "extras/TAS_WOLVERINE",
  colossus: "extras/COLOSSUS_CHARACTER",
};
const WIDE = 16 / 9;
const GAMBIT_FRAME = "22% 30%";
const ROGUE_FRAME = "78% 45%";

// Retro TV clip (Pexels 6976087, 1440x1080) cover-fit to 1920x1080: the CRT
// screen lands at roughly this rectangle.
const TV_SCREEN = { x: 655, y: 512, w: 596, h: 492 };

const STARTER_SHELF = [
  { asset: X.x129, label: "Dark Phoenix" },
  { asset: X.x141, label: "Days of Future Past" },
  { asset: X.x14, label: "X-Cutioner's Song" },
  { asset: "extras/GOD_LOVES_MAN_KILLS", label: "God Loves, Man Kills" },
  { asset: X.hom1, label: "House of M" },
];

export default {
  id: "episode-001",
  compositionId: "Episode001",
  title: "Where to Start Reading X-Men Without Losing Your Mind",
  duration: "16:11",
  blueprint: "episode001_visual_edit_blueprint.md",
  nudges: [],
  segments: [
    // ── 00:00-00:45 Hook: "Where do I even start?" ─────────────────────────
    { at: "0:00", type: "grid", columns: 3, assets: [X.x1, X.x129, X.x141, X.u266, X.hom1, X.hox1], push: 0.03, transitionIn: "cut", note: "3x2 wall, quick 2-3% push-in, slight staggered entrance" },
    { at: "0:06", type: "cover", asset: X.x1, treatment: "focus", focus: { x: 0.5, y: 0.62, zoom: 1.5 }, note: "Slow push toward the original team" },
    { at: "0:12", type: "cover", asset: X.x129, treatment: "focusOut", focus: { x: 0.45, y: 0.55, zoom: 1.9 }, note: "Crop toward Kitty/Emma, then pull back to the whole cover" },
    { at: "0:18", type: "cover", asset: X.x141, treatment: "still", note: "Hold on the iconic Wanted/Slain wall" },
    { at: "0:24", type: "cover", asset: X.hox1, treatment: "gentlePush", transitionOut: "cut", note: "Fast modern-era match cut, part 1" },
    { at: "0:27", type: "cover", asset: X.pox1, treatment: "gentlePush", transition: "cut", note: "Fast modern-era match cut, part 2" },
    { at: "0:30", type: "title", assets: ALL_18, wall: 0.5, title: "There is no single\ncorrect starting point.", transitionIn: "cut", note: "Comic-cover collage on dark background + text" },
    { at: "0:36", type: "title", title: "Where to start reading X-Men\nwithout losing your mind", kicker: "ComixCatalog · Episode 001", assets: [], note: "Main title card: dark background, Cyclops blue, gold accent line" },

    // ── 00:45-03:10 Childhood / Animated Series / character-first ───────────
    { at: "0:45", type: "media", asset: TAS.team, need: "1992 TAS team lineup or Night of the Sentinels", note: "TAS official/promotional still" },
    { at: "0:58", type: "media", asset: "stock/RETRO_TV", transitionOut: "cut", note: "Retro CRT / Saturday-morning visual: the real TV clip, as shot" },
    { at: "1:06", type: "media", asset: GIF.intro, crt: true, aspect: 4 / 3, treatment: "still", zoom: 1.13, position: "35% 30%", fallback: TAS.wolverine, fallbackProps: { treatment: "gentlePush" }, transitionIn: "cut", need: "Optional: TAS opening-titles GIF", note: "Cut to what's on the set: an actual TAS still with a broadcast-CRT grade (replaces a composited TV inset, which read as fake)" },
    { at: "1:10", type: "media", asset: TAS.jubileeSentinel, need: "Jubilee + team / Sentinel scene, official Marvel material", note: "Jubilee + team / Sentinel" },
    { at: "1:22", type: "media", asset: GIF.gambit, treatment: "still", position: "50% 30%", dur: 5.7, transitionOut: "cut", fallback: TAS.gambit, fallbackProps: { treatment: "panAcross", position: GAMBIT_FRAME, zoom: 1.55 }, need: "Optional: Gambit charging cards GIF", note: "GIF plays ~2 loops, then the still carries the beat. " +  "Gambit still, slight pan across cards/face" },
    { at: "1:27.7", type: "media", asset: TAS.gambit, treatment: "panAcross", position: GAMBIT_FRAME, zoom: 1.55, transitionIn: "cut", note: "Gambit still continues the 1:22 beat after the GIF" },
    { at: "1:34", type: "media", asset: TAS.gambitRogue, need: "Rogue + Gambit official still", note: "Rogue + Gambit" },
    { at: "1:46", type: "media", asset: TAS.colossus, position: "50% 22%", need: "Colossus animated or comic character shot", note: "Colossus character shot" },
    { at: "1:58", type: "media", asset: "stock/KID_BROWSING_COMICS", dur: 7, note: "Kid browsing comics: use only 5-7 seconds; then transition into real covers" },
    { at: "2:05", type: "stack", assets: [X.x14, X.x15, X.x16], note: "Three-cover shuffle (blueprint 2:12); started at 2:05 to carry the kid clip straight into real covers as the blueprint asks" },
    { at: "2:24", type: "cover", asset: X.u266, treatment: "slowPush", note: "\"Gambit became my guy.\"" },
    { at: "2:36", type: "pair", assets: [{ asset: TAS.gambit, aspect: 0.83, position: GAMBIT_FRAME }, { asset: X.u266 }], note: "Split: animated show left, comic origin/early appearance right" },
    { at: "2:50", type: "media", asset: TAS.gambit, treatment: "slowPush", position: GAMBIT_FRAME, zoom: 1.55, note: "Character montage 1/5: Gambit" },
    { at: "2:54", type: "media", asset: TAS.colossus, treatment: "slowPush", position: "50% 22%", note: "Character montage 2/5: Colossus" },
    { at: "2:58", type: "media", asset: TAS.gambitRogue, treatment: "slowPush", position: ROGUE_FRAME, zoom: 1.55, note: "Character montage 3/5: Rogue" },
    { at: "3:02", type: "media", asset: TAS.wolverine, treatment: "slowPush", need: "Optional Wolverine/team reaction shot", note: "Character montage 4/5: Wolverine" },
    { at: "3:06", type: "media", asset: TAS.team, treatment: "slowPull", title: "Find one character you care about.", note: "Character montage 5/5: team lineup; text overlay near end" },

    // ── 03:10-04:05 Why not just start with X-Men #1? ───────────────────────
    { at: "3:10", type: "cover", asset: X.x1, treatment: "slowPush", title: "X-Men #1 — 1963", note: "X-Men #1 full-screen + text" },
    { at: "3:24", type: "cover", asset: X.x1, treatment: "focus", focus: { x: 0.5, y: 0.18, zoom: 2 }, title: "Historically essential ≠ automatically the best first read.", note: "Tight crop on logo / original team + text" },
    { at: "3:38", type: "pair", assets: [{ asset: X.x1, label: "1963" }, { asset: X.hox1, label: "2019" }], note: "Distance between eras, without implying newer is better" },
    { at: "3:52", type: "shelf", slots: 5, numbered: true, title: "Treat it like a tasting menu.", note: "Five-slot starter shelf silhouettes appearing one by one" },

    // ── 04:05-06:55 #1 The Dark Phoenix Saga (centerpiece) ─────────────────
    { at: "4:05", type: "cover", asset: X.x129, treatment: "slowPush", number: 1, title: "The Dark Phoenix Saga", note: "#129 + text; large gold numeral per brand notes" },
    { at: "4:18", type: "cover", asset: X.x129, treatment: "panDown", note: "Crop/slow pan: establish team/era" },
    { at: "4:32", type: "cover", asset: X.x130, treatment: "focus", focus: { x: 0.5, y: 0.55, zoom: 1.6 }, note: "Push toward Dazzler / club-light imagery" },
    { at: "4:46", type: "pair", assets: [X.x129, X.x130], note: "Two-cover spread" },
    { at: "5:00", type: "cover", asset: X.x135, treatment: "slowPush", note: "Slow push on Phoenix" },
    { at: "5:14", type: "cover", asset: X.x136, treatment: "panAcross", focus: { y: 0.55, zoom: 1.7 }, note: "Crop across team attack" },
    { at: "5:28", type: "cover", asset: X.x137, treatment: "gentlePush", note: "Longest single-cover hold (18s); let the cover sell it" },
    { at: "5:46", type: "stack", assets: DARK_PHOENIX, note: "129 > 130 > 135 > 136 > 137, card-stack motion, not explosions" },
    { at: "6:00", type: "fan", assets: DARK_PHOENIX, field: "#000000", title: "Team dynamics • Consequences • Jean Grey", note: "Five-cover fan on black" },
    { at: "6:14", type: "media", asset: GIF.phoenix, treatment: "still", gifRate: 0.6, dur: 3, transitionOut: "cut", fallback: "extras/PHOENIX_OFFICIAL", fallbackProps: { treatment: "slowPush", dur: undefined }, need: "Optional: TAS Phoenix GIF", note: "Phoenix atmosphere: 0.9s GIF slowed to 0.6x, ~2 loops" },
    { at: "6:17", type: "media", asset: "extras/PHOENIX_OFFICIAL", treatment: "slowPush", transitionIn: "cut", note: "Official Phoenix Saga still carries the rest of the beat" },
    { at: "6:28", type: "cover", asset: X.x137, treatment: "focus", focus: { x: 0.5, y: 0.45, zoom: 2.1 }, note: "#137 again, tighter crop" },
    { at: "6:42", type: "shelf", slots: 5, numbered: true, items: [{ asset: X.x137, label: "Dark Phoenix" }], title: "Start here.", note: "Pull back from #137 into the starter-shelf card; slot 1 filled with #137 for continuity" },

    // ── 06:55-08:05 #2 Days of Future Past ────────────────────────────────
    { at: "6:55", type: "cover", asset: X.x141, treatment: "slowPush", number: 2, title: "Days of Future Past", note: "#141 + text" },
    { at: "7:08", type: "cover", asset: X.x141, treatment: "focus", focus: { x: 0.5, y: 0.5, zoom: 1.9 }, note: "Crop into wanted/slain character wall" },
    { at: "7:22", type: "cover", asset: X.u142, treatment: "slowPush", note: "UXM #142 full-screen" },
    { at: "7:36", type: "pair", assets: [X.x141, X.u142], field: "#10161d", tint: "#5b7187", note: "Split; cool/steel background, art untinted" },
    { at: "7:50", type: "media", asset: GIF.sentinel, treatment: "still", fallback: "extras/DOFP_SENTINEL_OFFICIAL", fallbackProps: { treatment: "slowPush" }, dur: 7, need: "Official Sentinel / dystopian X-Men art", note: "Optional official Sentinel art, then back to #141" },
    { at: "7:57", type: "cover", asset: X.x141, treatment: "still", note: "Back to #141" },

    // ── 08:05-09:20 #3 X-Cutioner's Song / 90s energy ─────────────────────
    { at: "8:05", type: "cover", asset: X.x14, treatment: "slowPush", number: 3, title: "X-Cutioner's Song", note: "#14 + text" },
    { at: "8:17", type: "cover", asset: X.x15, treatment: "driftLeft", transition: "cut", note: "#15" },
    { at: "8:29", type: "cover", asset: X.x16, treatment: "driftRight", transition: "cut", note: "#16" },
    { at: "8:41", type: "fan", assets: [X.x14, X.x15, X.x16], tint: "#c4122f", transition: "cut", note: "Three-cover fan; harder cuts, quicker motion, saturated accents" },
    { at: "8:55", type: "triptych", items: [{ asset: X.x14, focus: { x: 0.5, y: 0.55, zoom: 2.2 } }, { asset: X.x15, focus: { x: 0.45, y: 0.5, zoom: 2.2 } }, { asset: X.x16, focus: { x: 0.5, y: 0.5, zoom: 2.2 } }], title: "Squinty. Grizzled. Tough.", transitionIn: "cut", note: "Detail crops from #14-16 + text" },
    { at: "9:08", type: "media", asset: TAS.team, treatment: "slowPull", note: "90s team/TAS image: tie the era back to childhood" },

    // ── 09:20-09:45 Gambit beat ───────────────────────────────────────────
    { at: "9:20", type: "cover", asset: X.u266, treatment: "slowPush", note: "UXM #266 full-screen" },
    { at: "9:32", type: "pair", assets: [{ asset: X.u266 }, { asset: TAS.gambit, aspect: 0.83, position: GAMBIT_FRAME }], title: "Follow the character.", note: "UXM #266 + TAS Gambit split" },

    // ── 09:45-10:55 #4 God Loves, Man Kills ───────────────────────────────
    { at: "9:45", type: "cover", asset: "extras/GOD_LOVES_MAN_KILLS", treatment: "slowPush", number: 4, title: "God Loves, Man Kills", need: "Real GLMK cover (priority)", note: "Marvel Graphic Novel #5 (1982)" },
    { at: "9:58", type: "cover", asset: "extras/GOD_LOVES_MAN_KILLS", treatment: "panDown", note: "Slow pan across cover" },
    { at: "10:12", type: "cover", asset: "extras/GLMK_CONTEXT", treatment: "slowPush", need: "Xavier / Magneto / X-Men official art on theme", note: "Context art" },
    { at: "10:28", type: "cover", asset: "extras/GOD_LOVES_MAN_KILLS", treatment: "gentlePush", captionAlign: "right", title: "Fear • Prejudice • Persecution", note: "Cover + restrained text" },
    { at: "10:42", type: "cover", asset: "extras/GOD_LOVES_MAN_KILLS", treatment: "still", note: "Return to cover" },

    // ── 10:55-12:00 #5 House of M ─────────────────────────────────────────
    { at: "10:55", type: "cover", asset: X.hom1, treatment: "slowPush", number: 5, title: "House of M", note: "#1 + text" },
    { at: "11:08", type: "cover", asset: X.hom1, treatment: "panDown", note: "Slow pan/crop on #1" },
    { at: "11:22", type: "cover", asset: X.hom8, treatment: "slowPush", note: "#8" },
    { at: "11:36", type: "pair", assets: [X.hom1, X.hom8], note: "#1 + #8 side by side" },
    { at: "11:48", type: "pair", assets: [X.hom1, X.hom8], field: "#5a0a14", tint: "#c4122f", float: true, title: "House of M", note: "Red-background title card, covers floating; very slight drift, no reality-warp effects" },

    // ── 12:00-13:45 House of X / Powers of X: save it for later ────────────
    { at: "12:00", type: "cover", asset: X.hox1, treatment: "slowPush", title: "Then: House of X / Powers of X", note: "HOX #1 + text" },
    { at: "12:14", type: "cover", asset: X.pox1, treatment: "driftLeft", note: "POX #1" },
    { at: "12:28", type: "cover", asset: X.hox6, treatment: "slowPush", note: "HOX #6" },
    { at: "12:42", type: "cover", asset: X.pox6, treatment: "driftRight", note: "POX #6" },
    { at: "12:56", type: "grid", assets: HOXPOX, columns: 4, field: "#060909", tint: "#14b8a6", note: "Four-cover grid, clean white/black/teal Krakoa-era language" },
    { at: "13:10", type: "pair", assets: [X.hox1, X.pox1], field: "#060909", tint: "#14b8a6", title: "It turns decades of X-Men history on its head.", note: "HOX #1 / POX #1 split + text" },
    { at: "13:22", type: "pair", assets: [X.hox6, X.pox6], field: "#060909", tint: "#14b8a6", note: "HOX #6 / POX #6 split" },
    { at: "13:34", type: "grid", assets: HOXPOX, columns: 4, field: "#060909", tint: "#14b8a6", title: "Better after you have some history.", note: "Pull back to all four covers + text" },

    // ── 13:45-14:50 "Shop like a kid" ─────────────────────────────────────
    { at: "13:45", type: "media", asset: "stock/KID_BROWSING_COMICS", note: "Comic-shop / browsing footage (existing fallback: kid browsing comics)" },
    { at: "13:56", type: "stack", assets: [X.x14, X.u266, X.hom1], note: "Shuffled like books pulled from a box" },
    { at: "14:08", type: "media", asset: "stock/COMIC_PAGE_FLIP", note: "Page flip / hand browsing: texture, kept short" },
    { at: "14:20", type: "grid", assets: ALL_18, columns: 6, note: "Cover wall of all 18 covers" },
    { at: "14:32", type: "pair", assets: [{ asset: X.u266 }, { asset: TAS.gambit, aspect: 0.83, position: GAMBIT_FRAME }], note: "Character-first: Gambit #266 + TAS Gambit" },
    { at: "14:42", type: "chapter", title: "Let your heart lead you\nonce you've got a character you like.", note: "Text card, ComixCatalog blue/gold" },

    // ── 14:50-15:35 ComixCatalog ──────────────────────────────────────────
    { at: "14:50", type: "comixcatalog", tagline: "Catalog. Collect. Connect.", bug: true, note: "Real logo/wordmark on dark; brand card copy" },
    { at: "15:00", type: "screen", asset: "screenshots/CC_HOME", focus: { x: 0.3, y: 0.3 }, bug: true, note: "Actual homepage capture" },
    { at: "15:10", type: "screen", asset: "screenshots/CC_SEARCH_XMEN", focus: { x: 0.45, y: 0.55 }, bug: true, note: "Search/results showing X-Men material" },
    { at: "15:20", type: "screen", asset: "screenshots/CC_ISSUE_PAGE", focus: { x: 0.4, y: 0.35 }, bug: true, note: "Comic-detail page (UXM #266)" },
    { at: "15:28", type: "screen", asset: "screenshots/CC_WANTLIST", crop: { left: 60, top: 136, right: 24, bottom: 52 }, focus: { x: 0.4, y: 0.35 }, bug: true, need: "Actual wantlist / collection-management UI (needs a signed-in capture)", note: "Wantlist / collection UI; never invented UI" },

    // ── 15:35-16:11 Recap / CTA ───────────────────────────────────────────
    { at: "15:35", type: "shelf", items: STARTER_SHELF, title: "The five-book starter shelf", note: "Five-book starter shelf" },
    { at: "15:48", type: "shelfLater", items: STARTER_SHELF.map((i) => i.asset), later: HOXPOX, laterLabel: "Later", note: "Shelf compresses to center; HOX/POX appear behind as later" },
    { at: "15:57", type: "chapter", title: "Don't turn reading comics\ninto homework.", note: "Text card" },
    { at: "16:05", type: "end", title: "Go pick up a comic.\nReport back in the comments.", bug: false, note: "ComixCatalog-branded end card (logo is part of the card)" },
  ],
};
