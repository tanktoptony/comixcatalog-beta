// Episode 001, V2: retimed against the actual narration clock (15:44.16).
//
// Authority, in order:
//   1. The narration section boundaries and beat timecodes supplied from
//      Descript (SECTIONS below and every segment marked `beat:`). These are
//      hard cut points.
//   2. The blueprint's shot content and order inside each section
//      (episode001_visual_edit_blueprint.md), fitted proportionally into the
//      real section window with `fit()`. Nothing is globally stretched: each
//      section is fitted on its own, so drift cannot accumulate.
//
// Where a character, comic, show, movie or creator is named and no
// timecode for that word has been supplied, the shot sits in the
// blueprint's order within its section. Supplying a word-level transcript
// lets those snap to the exact word (rule: image within 0-1.5s of the name).
//
// Silent visual track; the narration and music stay in Descript.

const t = (clock) => {
  const [m, s] = String(clock).split(":");
  return Number(m) * 60 + Number(s);
};

// Place a section's shots, authored as offsets on a reference length, into
// the real [start, end) window. Offsets scale; `dur` (GIF loop lengths)
// does not, so animated beats keep their natural speed.
function fit(start, end, refLength, shots) {
  const k = (end - start) / refLength;
  return shots.map(([offset, seg]) => ({ ...seg, at: +(start + offset * k).toFixed(3) }));
}

const S = {
  hook: [t("0:00.00"), t("0:40.12")],
  tas: [t("0:40.12"), t("0:52.34")],
  shop: [t("0:52.34"), t("1:13.18")],
  colossus: [t("1:13.18"), t("1:46.47")],
  gambit: [t("1:46.47"), t("2:41.76")],
  xmen1: [t("2:41.76"), t("3:44.84")],
  phoenix: [t("3:44.84"), t("6:44.89")],
  dofp: [t("6:44.89"), t("7:34.13")],
  xcut: [t("7:34.13"), t("9:03.00")],
  glmk: [t("9:03.00"), t("10:35.64")],
  hom: [t("10:35.64"), t("11:43.49")],
  hoxpox: [t("11:43.49"), t("12:44.88")],
  shopKid: [t("12:44.88"), t("14:30.64")],
  cc: [t("14:30.64"), t("15:03.00")],
  outro: [t("15:03.00"), t("15:44.16")],
};

const cv = (name) => `covers/${name}.jpg`;
const X = {
  x1: cv("x-men-001-1963"), x129: cv("x-men-129-1980"), x130: cv("x-men-130-1980"),
  x135: cv("x-men-135-1980"), x136: cv("x-men-136-1980"), x137: cv("x-men-137-1980"),
  x141: cv("x-men-141-1981"), u142: cv("uncanny-x-men-142-1981"), u266: cv("uncanny-x-men-266-1990"),
  x14: cv("x-men-014-1992"), x15: cv("x-men-015-1992"), x16: cv("x-men-016-1993"),
  hom1: cv("house-of-m-001-2005"), hom8: cv("house-of-m-008-2005"),
  hox1: cv("house-of-x-001-2019"), hox6: cv("house-of-x-006-2019"),
  pox1: cv("powers-of-x-001-2019"), pox6: cv("powers-of-x-006-2019"),
};
const ALL_18 = Object.values(X);
const DARK_PHOENIX = [X.x129, X.x130, X.x135, X.x136, X.x137];
const HOXPOX = [X.hox1, X.pox1, X.hox6, X.pox6];

const E = {
  tasTeam: "extras/TAS_TEAM_1992",
  tasIntro: "extras/GIF_TAS_INTRO_END.mp4",
  gambitRogue: "extras/TAS_GAMBIT_ROGUE",
  wolverine: "extras/TAS_WOLVERINE",
  colossusArt: "extras/COLOSSUS_CHARACTER",
  // New for V2. Absent files render as labeled placeholders, or as the
  // named `fallback` where a real image of the same character exists.
  colossusTas: "extras/COLOSSUS_TAS",
  colossusSentinel: "extras/COLOSSUS_SENTINEL",
  colossusQuiet: "extras/COLOSSUS_QUIET",
  bishop: "extras/BISHOP",
  jean: "extras/JEAN_GREY",
  storm: "extras/STORM",
  tatum: "extras/GAMBIT_TATUM",
  gifGambit: "extras/GIF_GAMBIT_CARDS",
  gifPhoenix: "extras/GIF_PHOENIX",
  gifSentinel: "extras/GIF_SENTINEL",
  phoenixStill: "extras/PHOENIX_OFFICIAL",
  dofpStill: "extras/DOFP_SENTINEL_OFFICIAL",
  glmk: "extras/GOD_LOVES_MAN_KILLS",
  glmkContext: "extras/GLMK_CONTEXT",
};
const GAMBIT_FRAME = "22% 30%";
const ROGUE_FRAME = "78% 45%";
const COLOSSUS_FACE = "50% 22%";
// Framing for stand-ins drawn from wider images of the same character.
const GAMBIT_TAS = { asset: E.gambitRogue, position: GAMBIT_FRAME, zoom: 1.55 };
// Storm sits at about (0.39, 0.22) of the key art; this origin/zoom centres
// her and pushes Cyclops off the right edge.
const STORM_IN_KEY_ART = { position: "33.5% 8%", zoom: 3 };
const JEAN_ON_135 = { focus: { x: 0.5, y: 0.45, zoom: 1.8 } };

const STARTER_SHELF = [
  { asset: X.x129, label: "Dark Phoenix" },
  { asset: X.x141, label: "Days of Future Past" },
  { asset: X.x14, label: "X-Cutioner's Song" },
  { asset: E.glmk, label: "God Loves, Man Kills" },
  { asset: X.hom1, label: "House of M" },
];

export default {
  id: "episode-001-v2",
  assetEpisodeId: "episode-001",
  outputDir: "episode-001",
  outputName: "episode-001-visual-track-v2",
  compositionId: "Episode001V2",
  title: "Where to Start Reading X-Men Without Losing Your Mind (V2, narration-synced)",
  duration: t("15:44.16"),
  nudges: [],
  segments: [
    // ── 00:00.00-00:40.12 Hook / reading-order overload ──────────────────
    ...fit(...S.hook, 45, [
      [0, { type: "grid", columns: 3, assets: [X.x1, X.x129, X.x141, X.u266, X.hom1, X.hox1], push: 0.03, transitionIn: "cut" }],
      [6, { type: "cover", asset: X.x1, treatment: "focus", focus: { x: 0.5, y: 0.62, zoom: 1.5 } }],
      [12, { type: "cover", asset: X.x129, treatment: "focusOut", focus: { x: 0.45, y: 0.55, zoom: 1.9 } }],
      [18, { type: "cover", asset: X.x141, treatment: "still" }],
      [24, { type: "cover", asset: X.hox1, treatment: "gentlePush", transitionOut: "cut" }],
      [27, { type: "cover", asset: X.pox1, treatment: "gentlePush", transition: "cut" }],
      [30, { type: "title", assets: ALL_18, wall: 0.5, title: "There is no single\ncorrect starting point.", transitionIn: "cut" }],
      [36, { type: "title", title: "Where to start reading X-Men\nwithout losing your mind", kicker: "ComixCatalog · Episode 001", assets: [] }],
    ]),

    // ── 00:40.12-00:52.34 X-Men: The Animated Series ─────────────────────
    { at: t("0:40.12"), type: "media", asset: E.tasTeam, treatment: "slowPush", transitionIn: "cut" },
    { at: 44.6, type: "media", asset: "stock/RETRO_TV", transitionOut: "cut" },
    { at: t("0:48.34"), type: "media", asset: E.tasIntro, crt: true, aspect: 4 / 3, treatment: "still", zoom: 1.13, position: "35% 30%", transitionIn: "cut", note: "1992 opening titles, 4s, ends on the section boundary" },

    // ── 00:52.34-01:13.18 Comic shop / random covers ─────────────────────
    ...fit(...S.shop, 21, [
      [0, { type: "media", asset: "stock/KID_BROWSING_COMICS" }],
      [6, { type: "stack", assets: [X.x14, X.x15, X.x16] }],
      [13, { type: "grid", assets: ALL_18, columns: 6 }],
    ]),

    // ── 01:13.18-01:46.47 COLOSSUS ───────────────────────────────────────
    { at: t("1:13.18"), type: "media", asset: E.colossusTas, fallback: E.colossusArt, fallbackProps: { position: COLOSSUS_FACE, treatment: "slowPush" }, treatment: "slowPush", transitionIn: "cut",
      beat: "1:13.18-1:21.51 Colossus was my first favorite; friends had chosen Wolverine and Gambit", need: "Colossus hero image / TAS still",
      note: "Colossus holds the whole beat. Wolverine/Gambit flashes are optional and need the word timecodes to land on the names, so they are omitted rather than guessed." },
    { at: t("1:21.93"), type: "media", asset: E.colossusSentinel, fallback: E.colossusArt, fallbackProps: { position: "30% 45%", zoom: 1.2, treatment: "slowPush" }, treatment: "slowPush", transitionIn: "cut", dur: 4,
      beat: "1:21.93-1:30.20 enormous Russian, turns body to steel", need: "Metal-form Colossus vs Sentinels" },
    { at: t("1:21.93") + 4, type: "pair", assets: [{ asset: E.colossusArt, aspect: 0.8, position: "40% 35%" }, { asset: E.gifSentinel, aspect: 16 / 9 }], transition: "cut",
      beat: "...punches Sentinels", note: "Colossus beside a TAS Sentinel until a true confrontation image arrives" },
    { at: t("1:30.60"), type: "media", asset: E.colossusQuiet, treatment: "slowPull", position: "62% 35%", transitionIn: "cut",
      beat: "1:30.60-1:46.47 gentle giant, painter, family, more than strength", need: "Quiet Colossus: portrait, painting, family" },

    // ── 01:46.47-02:41.76 GAMBIT ─────────────────────────────────────────
    { at: t("1:46.47"), type: "cover", asset: X.u266, treatment: "slowPush", transitionIn: "cut", beat: "1:46.47 Gambit became my favorite (UXM #266)" },
    { at: 113, type: "cover", asset: X.u266, treatment: "focus", focus: { x: 0.66, y: 0.36, zoom: 2.2 }, beat: "...the look, trench coat, staff (Gambit sits right of Storm on #266)" },
    { at: 119, type: "media", asset: E.gifGambit, treatment: "still", position: "50% 30%", dur: 5.7, transitionOut: "cut", beat: "...glowing cards, kinetic energy" },
    { at: 124.7, type: "cover", asset: X.u266, treatment: "focusOut", focus: { x: 0.6, y: 0.3, zoom: 2.2 }, transitionIn: "cut", beat: "...kinetic energy: off Gambit's face back to the full #266 cover" },
    { at: t("2:08.83"), type: "media", ...GAMBIT_TAS, treatment: "slowPush", transitionIn: "cut", beat: "2:08.83 animated-series Gambit, Cajun accent" },
    { at: 134.8, type: "media", asset: E.gambitRogue, treatment: "slowPush", beat: "...relationship with Rogue, can't touch (to 2:20.66)" },
    { at: t("2:21.31"), type: "media", asset: E.colossusArt, position: COLOSSUS_FACE, treatment: "still", transition: "cut", beat: "2:21.31 Colossus is still #2 (callback)" },
    { at: 143.6, type: "media", ...GAMBIT_TAS, treatment: "still", transition: "cut", beat: "...Gambit #1" },
    { at: 146.3, type: "media", asset: E.bishop, treatment: "still", position: "50% 12%", transition: "cut", need: "Bishop", beat: "...Bishop" },
    { at: 148.6, type: "cover", asset: E.jean, fallback: X.x135, fallbackProps: { treatment: "focus", ...JEAN_ON_135 }, treatment: "still", transition: "cut", need: "Jean Grey", beat: "...Jean" },
    { at: 150.9, type: "media", asset: E.wolverine, treatment: "still", transition: "cut", beat: "...Wolverine (to 2:33.32)" },
    { at: t("2:33.32"), type: "media", asset: E.tatum, treatment: "slowPush", transitionIn: "cut", need: "Channing Tatum as Gambit, Deadpool & Wolverine (official still or trailer frame)", beat: "2:33.32-2:41.22 Channing Tatum Gambit; \"I cried. Tears of joy.\" Held through the punchline" },

    // ── 02:41.76-03:44.84 Why not start with X-Men #1 (1963) ─────────────
    ...fit(...S.xmen1, 55, [
      [0, { type: "cover", asset: X.x1, treatment: "slowPush", title: "X-Men #1 — 1963", transitionIn: "cut" }],
      [14, { type: "cover", asset: X.x1, treatment: "focus", focus: { x: 0.5, y: 0.18, zoom: 2 }, title: "Historically essential ≠ automatically the best first read." }],
      [28, { type: "pair", assets: [{ asset: X.x1, label: "1963" }, { asset: X.hox1, label: "2019" }] }],
      [42, { type: "shelf", slots: 5, numbered: true, title: "Treat it like a tasting menu." }],
    ]),

    // ── 03:44.84-06:44.89 Dark Phoenix Saga ──────────────────────────────
    ...fit(...S.phoenix, 170, [
      [0, { type: "cover", asset: X.x129, treatment: "slowPush", number: 1, title: "The Dark Phoenix Saga", transitionIn: "cut" }],
      [13, { type: "cover", asset: X.x129, treatment: "panDown" }],
      [27, { type: "cover", asset: X.x130, treatment: "focus", focus: { x: 0.5, y: 0.55, zoom: 1.6 } }],
      [41, { type: "pair", assets: [X.x129, X.x130] }],
      [55, { type: "cover", asset: X.x135, treatment: "slowPush" }],
      [69, { type: "cover", asset: X.x136, treatment: "panAcross", focus: { y: 0.55, zoom: 1.7 } }],
      [83, { type: "cover", asset: X.x137, treatment: "gentlePush" }],
      [101, { type: "stack", assets: DARK_PHOENIX }],
      [115, { type: "fan", assets: DARK_PHOENIX, field: "#000000", title: "Team dynamics • Consequences • Jean Grey" }],
      [129, { type: "media", asset: E.gifPhoenix, treatment: "still", gifRate: 0.6, dur: 3, transitionOut: "cut" }],
      [132.2, { type: "media", asset: E.phoenixStill, treatment: "slowPush", transitionIn: "cut" }],
      [143, { type: "cover", asset: X.x137, treatment: "focus", focus: { x: 0.5, y: 0.45, zoom: 2.1 } }],
      [157, { type: "shelf", slots: 5, numbered: true, items: [{ asset: X.x137, label: "Dark Phoenix" }], title: "Start here." }],
    ]),

    // ── 06:44.89-07:34.13 Days of Future Past ────────────────────────────
    ...fit(...S.dofp, 70, [
      [0, { type: "cover", asset: X.x141, treatment: "slowPush", number: 2, title: "Days of Future Past", transitionIn: "cut" }],
      [13, { type: "cover", asset: X.x141, treatment: "focus", focus: { x: 0.5, y: 0.5, zoom: 1.9 } }],
      [27, { type: "cover", asset: X.u142, treatment: "slowPush" }],
      [41, { type: "pair", assets: [X.x141, X.u142], field: "#10161d", tint: "#5b7187" }],
      [55, { type: "media", asset: E.gifSentinel, treatment: "still", dur: 7, fallback: E.dofpStill, fallbackProps: { treatment: "slowPush" } }],
      [65, { type: "cover", asset: X.x141, treatment: "still" }],
    ]),

    // ── 07:34.13-09:03.00 X-Cutioner's Song ──────────────────────────────
    ...fit(...S.xcut, 75, [
      [0, { type: "cover", asset: X.x14, treatment: "slowPush", number: 3, title: "X-Cutioner's Song", transitionIn: "cut" }],
      [12, { type: "cover", asset: X.x15, treatment: "driftLeft", transition: "cut" }],
      [24, { type: "cover", asset: X.x16, treatment: "driftRight", transition: "cut" }],
      [36, { type: "fan", assets: [X.x14, X.x15, X.x16], tint: "#c4122f", transition: "cut" }],
      [50, { type: "triptych", items: [{ asset: X.x14, focus: { x: 0.5, y: 0.55, zoom: 2.2 } }, { asset: X.x15, focus: { x: 0.45, y: 0.5, zoom: 2.2 } }, { asset: X.x16, focus: { x: 0.5, y: 0.5, zoom: 2.2 } }], title: "Squinty. Grizzled. Tough.", transitionIn: "cut" }],
      [63, { type: "media", asset: E.tasTeam, treatment: "slowPull" }],
    ]),

    // ── 09:03.00-10:35.64 God Loves, Man Kills ───────────────────────────
    ...fit(...S.glmk, 70, [
      [0, { type: "cover", asset: E.glmk, treatment: "slowPush", number: 4, title: "God Loves, Man Kills", transitionIn: "cut" }],
      [13, { type: "cover", asset: E.glmk, treatment: "panDown" }],
      [27, { type: "cover", asset: E.glmkContext, treatment: "slowPush" }],
      [43, { type: "cover", asset: E.glmk, treatment: "gentlePush", captionAlign: "right", title: "Fear • Prejudice • Persecution" }],
      [57, { type: "cover", asset: E.glmk, treatment: "still" }],
    ]),

    // ── 10:35.64-11:43.49 House of M ─────────────────────────────────────
    ...fit(...S.hom, 65, [
      [0, { type: "cover", asset: X.hom1, treatment: "slowPush", number: 5, title: "House of M", transitionIn: "cut" }],
      [13, { type: "cover", asset: X.hom1, treatment: "panDown" }],
      [27, { type: "cover", asset: X.hom8, treatment: "slowPush" }],
      [41, { type: "pair", assets: [X.hom1, X.hom8] }],
      [53, { type: "pair", assets: [X.hom1, X.hom8], field: "#5a0a14", tint: "#c4122f", float: true, title: "House of M" }],
    ]),

    // ── 11:43.49-12:44.88 House of X / Powers of X ───────────────────────
    ...fit(...S.hoxpox, 105, [
      [0, { type: "cover", asset: X.hox1, treatment: "slowPush", title: "Then: House of X / Powers of X", transitionIn: "cut" }],
      [14, { type: "cover", asset: X.pox1, treatment: "driftLeft" }],
      [28, { type: "cover", asset: X.hox6, treatment: "slowPush" }],
      [42, { type: "cover", asset: X.pox6, treatment: "driftRight" }],
      [56, { type: "grid", assets: HOXPOX, columns: 4, field: "#060909", tint: "#14b8a6" }],
      [70, { type: "pair", assets: [X.hox1, X.pox1], field: "#060909", tint: "#14b8a6", title: "It turns decades of X-Men history on its head." }],
      [82, { type: "pair", assets: [X.hox6, X.pox6], field: "#060909", tint: "#14b8a6" }],
      [94, { type: "grid", assets: HOXPOX, columns: 4, field: "#060909", tint: "#14b8a6", title: "Better after you have some history." }],
    ]),

    // ── 12:44.88-14:30.64 Shop like a kid ────────────────────────────────
    { at: t("12:44.88"), type: "media", asset: "stock/KID_BROWSING_COMICS", transitionIn: "cut" },
    { at: 776.5, type: "stack", assets: [X.x14, X.u266, X.hom1] },
    { at: 791, type: "media", asset: "stock/COMIC_PAGE_FLIP" },
    { at: t("13:24.03"), type: "media", ...GAMBIT_TAS, treatment: "still", transition: "cut", beat: "13:24.03 callback: Gambit" },
    { at: 807.43, type: "media", asset: E.colossusTas, fallback: E.colossusArt, fallbackProps: { position: COLOSSUS_FACE }, treatment: "still", transition: "cut", beat: "...Colossus" },
    { at: 810.84, type: "media", asset: E.storm, fallback: E.tasTeam, fallbackProps: STORM_IN_KEY_ART, treatment: "still", transition: "cut", need: "Storm", beat: "...Storm (to 13:34.25)" },
    { at: t("13:34.25"), type: "grid", assets: ALL_18, columns: 6, transitionIn: "cut" },
    { at: 830, type: "pair", assets: [{ asset: X.u266 }, { ...GAMBIT_TAS, aspect: 0.83 }] },
    { at: 845, type: "grid", columns: 3, assets: [X.x129, X.x141, X.x14, X.u266, X.hom1, X.hox1] },
    { at: 862, type: "chapter", title: "Let your heart lead you\nonce you've got a character you like." },

    // ── 14:30.64-15:03.00 ComixCatalog ───────────────────────────────────
    ...fit(...S.cc, 45, [
      [0, { type: "comixcatalog", tagline: "Catalog. Collect. Connect.", bug: true, transitionIn: "cut" }],
      [10, { type: "screen", asset: "screenshots/CC_HOME", focus: { x: 0.3, y: 0.3 }, bug: true }],
      [20, { type: "screen", asset: "screenshots/CC_SEARCH_XMEN", focus: { x: 0.45, y: 0.55 }, bug: true }],
      [30, { type: "screen", asset: "screenshots/CC_ISSUE_PAGE", focus: { x: 0.4, y: 0.35 }, bug: true }],
      [38, { type: "screen", asset: "screenshots/CC_WANTLIST", crop: { left: 60, top: 136, right: 24, bottom: 52 }, focus: { x: 0.4, y: 0.35 }, bug: true }],
    ]),

    // ── 15:03.00-15:44.16 Outro ──────────────────────────────────────────
    ...fit(...S.outro, 36, [
      [0, { type: "shelf", items: STARTER_SHELF, title: "The five-book starter shelf", transitionIn: "cut" }],
      [13, { type: "shelfLater", items: STARTER_SHELF.map((i) => i.asset), later: HOXPOX, laterLabel: "Later" }],
      [22, { type: "chapter", title: "Don't turn reading comics\ninto homework." }],
      [30, { type: "end", title: "Go pick up a comic.\nReport back in the comments." }],
    ]),
  ],
};
