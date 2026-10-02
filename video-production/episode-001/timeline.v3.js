// Episode 001, V3: the rewritten script (Oct 1), with narration and music
// mixed in, so the render is the finished video.
//
// Every shot is anchored to the phrase it illustrates, not a timecode.
// shared/anchors.js finds each phrase in the narration's word timestamps
// (narration.words.js, from scripts/transcribe.py), so swapping the scratch
// voice for Tony's recording is: drop the file in, re-transcribe, re-render.
//
//   1. Put the recording at ~/Desktop/episode-001-assets/audio/NARRATION.<wav|m4a|mp3>
//   2. npm run sync:001
//   3. python scripts/transcribe.py public/episode-001/audio/NARRATION.m4a episode-001/narration.words.js
//   4. npm run render:001:v3:preview   (then render:001:v3 for 1080p)
//
// Anchors the transcript can't find are listed by build-asset-index and in
// the render log, and placed evenly between their neighbours.

import words from "./narration.words.js";
import { resolveAnchors } from "../shared/anchors.js";

// The narration file that narration.words.js was made from. The scratch
// track is Windows text-to-speech, for timing only.
const NARRATION = words.source?.startsWith("NARRATION_SCRATCH") ? "audio/NARRATION_SCRATCH.wav" : `audio/${words.source}`;
const VOICE_AT = 0.8; // seconds of picture before the first word
const LEAD = 0.12; // cut this much before the anchor word lands

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
  colossusSentinel: "extras/COLOSSUS_SENTINEL",
  colossusQuiet: "extras/COLOSSUS_QUIET",
  storm: "extras/STORM",
  gifGambit: "extras/GIF_GAMBIT_CARDS",
  gifPhoenix: "extras/GIF_PHOENIX",
  gifSentinel: "extras/GIF_SENTINEL",
  phoenixStill: "extras/PHOENIX_OFFICIAL",
  dofpStill: "extras/DOFP_SENTINEL_OFFICIAL",
  glmk: "extras/GOD_LOVES_MAN_KILLS",
  glmkContext: "extras/GLMK_CONTEXT",
  // Tony's own footage, when it exists (B-roll and the ComixCatalog spot).
  // Missing files fall back to stock or render as labeled placeholders.
  shopBroll: "broll/SHOP_BROLL",
  longboxBroll: "broll/LONGBOX_BROLL",
};
const GAMBIT_FRAME = "22% 30%";
const ROGUE_FRAME = "78% 45%";
const COLOSSUS_FACE = "50% 22%";
const GAMBIT_TAS = { asset: E.gambitRogue, position: GAMBIT_FRAME, zoom: 1.55 };
const STORM_IN_KEY_ART = { position: "33.5% 8%", zoom: 3 };
const STARTER_SHELF = [
  { asset: X.x129, label: "Dark Phoenix" },
  { asset: X.x141, label: "Days of Future Past" },
  { asset: X.x14, label: "X-Cutioner's Song" },
  { asset: E.glmk, label: "God Loves, Man Kills" },
  { asset: X.hom1, label: "House of M" },
];
const SHOP = { asset: E.shopBroll, fallback: "stock/KID_BROWSING_COMICS" };

// [anchor phrase, segment]. Order must follow the script. Prefer plain
// words over proper nouns in anchors: Whisper hears "Stan Lee" as
// "Stanley" and "X-Cutioner's" as "Excutioners".
const CUES = [
  // ── Cold open: Graham Crackers ──────────────────────────────────────────
  ["A few years ago I walked into Graham Crackers", { type: "media", ...SHOP, treatment: "slowPush", transitionIn: "cut" }],
  ["Where do I start with X-Men", { type: "chapter", title: "“Where do I start\nwith X-Men?”" }],
  ["Because X-Men is sixty years of comics", { type: "grid", columns: 3, assets: [X.x1, X.x129, X.x141, X.u266, X.hom1, X.hox1], push: 0.03, transitionIn: "cut" }],
  ["a dozen books with X-Men in the title", { type: "grid", assets: ALL_18, columns: 6 }],
  ["He didn't hand me a reading order", { type: "media", asset: "stock/COMIC_PAGE_FLIP" }],
  ["So that's what this video is", { type: "shelf", slots: 5, numbered: true, title: "Five books. One shelf." }],
  ["Let's go", { type: "title", title: "Where to start reading X-Men\nwithout losing your mind", kicker: "ComixCatalog · Episode 001", assets: ALL_18, wall: 0.5 }],

  // ── How I got here ──────────────────────────────────────────────────────
  ["Quick background", { type: "media", asset: E.tasTeam, treatment: "slowPush", transitionIn: "cut" }],
  ["The Animated Series came on", { type: "media", asset: "stock/RETRO_TV", transitionOut: "cut" }],
  ["That theme song still lives rent free", { type: "media", asset: E.tasIntro, crt: true, aspect: 4 / 3, treatment: "still", zoom: 1.13, position: "35% 30%", transitionIn: "cut", dur: 4.2, note: "1992 opening titles. Content ID risk: see RIGHTS_AND_CONTENT_ID.md" }],
  ["My best friend is the one who got us all into it", { type: "media", asset: E.tasTeam, treatment: "slowPull", transitionIn: "cut" }],
  ["he picked Gambit", { type: "media", ...GAMBIT_TAS, treatment: "still", transition: "cut" }],
  ["Gambit and Wolverine were the coolest", { type: "media", asset: E.wolverine, treatment: "still", transition: "cut" }],
  ["Gambit had the trench coat", { type: "media", asset: E.gifGambit, treatment: "still", position: "50% 30%", dur: 5.7, transitionIn: "cut" }],
  ["He also decided the girl everybody", { type: "media", asset: E.gambitRogue, position: ROGUE_FRAME, zoom: 1.5, treatment: "slowPush", transitionIn: "cut" }],
  ["I got Colossus", { type: "media", asset: E.colossusArt, position: COLOSSUS_FACE, treatment: "still", transition: "cut" }],
  ["Big Russian guy turns into steel", { type: "media", asset: E.colossusSentinel, fallback: E.colossusArt, treatment: "slowPush", transitionIn: "cut" }],
  ["But he was mine", { type: "media", asset: E.colossusArt, position: "40% 35%", treatment: "slowPull" }],
  ["Strongest guy in the room", { type: "media", asset: E.colossusQuiet, fallback: E.colossusArt, treatment: "slowPull", position: "62% 35%" }],
  ["I don't think I'm the only one", { type: "grid", assets: ALL_18, columns: 6, transitionIn: "cut" }],
  ["Through a character", { type: "chapter", title: "Not a reading order.\nA character." }],

  // ── Don't start at #1 ───────────────────────────────────────────────────
  ["The obvious move is to start at the beginning", { type: "cover", asset: X.x1, treatment: "slowPush", title: "X-Men #1 · 1963", transitionIn: "cut" }],
  ["and Jack Kirby the original five", { type: "cover", asset: X.x1, treatment: "focus", focus: { x: 0.5, y: 0.62, zoom: 1.5 } }],
  ["Honestly it feels like a different team", { type: "cover", asset: X.x1, treatment: "focus", focus: { x: 0.5, y: 0.18, zoom: 2 } }],
  ["once we get to Hickman", { type: "pair", assets: [{ asset: X.x1, label: "1963" }, { asset: X.hox1, label: "2019" }] }],
  ["But historically important and a good first read", { type: "cover", asset: X.x1, treatment: "gentlePush", title: "Historically important ≠ a good first read." }],
  ["So treat it like a tasting menu", { type: "shelf", slots: 5, numbered: true, title: "Treat it like a tasting menu." }],

  // ── 1. Dark Phoenix Saga ────────────────────────────────────────────────
  ["Number one The Dark Phoenix Saga", { type: "cover", asset: X.x129, treatment: "slowPush", number: 1, title: "The Dark Phoenix Saga", transitionIn: "cut" }],
  ["If you only read one X-Men story", { type: "cover", asset: X.x129, treatment: "panDown" }],
  ["Issue 129 alone introduces Kitty Pryde", { type: "cover", asset: X.x129, treatment: "focus", focus: { x: 0.45, y: 0.55, zoom: 1.9 } }],
  ["130 gives you Dazzler", { type: "cover", asset: X.x130, treatment: "focus", focus: { x: 0.5, y: 0.55, zoom: 1.6 } }],
  ["But the real story is Jean Grey", { type: "cover", asset: X.x135, treatment: "slowPush", transitionIn: "cut" }],
  ["What makes it hold up", { type: "cover", asset: X.x136, treatment: "panAcross", focus: { y: 0.55, zoom: 1.7 } }],
  ["And then 137", { type: "cover", asset: X.x137, treatment: "gentlePush", transitionIn: "cut" }],
  ["The cartoon did it", { type: "media", asset: E.gifPhoenix, treatment: "still", gifRate: 0.6, dur: 3, transitionIn: "cut" }],
  ["The movies have tried it twice", { type: "media", asset: E.phoenixStill, treatment: "slowPush", transitionIn: "cut" }],
  ["Even knowing how it ends", { type: "stack", assets: DARK_PHOENIX }],
  ["Team dynamics real consequences", { type: "fan", assets: DARK_PHOENIX, field: "#000000", title: "Team dynamics • Consequences • Jean Grey" }],
  ["If you start anywhere start here", { type: "shelf", slots: 5, numbered: true, items: [{ asset: X.x129, label: "Dark Phoenix" }], title: "Start here." }],

  // ── 2. Days of Future Past ──────────────────────────────────────────────
  ["Number two Days of Future Past", { type: "cover", asset: X.x141, treatment: "slowPush", number: 2, title: "Days of Future Past", transitionIn: "cut" }],
  ["That cover is the whole pitch", { type: "cover", asset: X.x141, treatment: "focus", focus: { x: 0.5, y: 0.5, zoom: 1.9 } }],
  ["Kitty's mind gets sent back", { type: "cover", asset: X.u142, treatment: "slowPush", transitionIn: "cut" }],
  ["It's short it's dark", { type: "media", asset: E.gifSentinel, treatment: "still", dur: 6, fallback: E.dofpStill, transitionIn: "cut" }],
  ["including the movie and the cartoon episode", { type: "pair", assets: [X.x141, X.u142], field: "#10161d", tint: "#5b7187" }],

  // ── 3. X-Cutioner's Song ────────────────────────────────────────────────
  ["Number three", { type: "cover", asset: X.x14, treatment: "slowPush", number: 3, title: "X-Cutioner's Song", transitionIn: "cut" }],
  ["a crossover across four X-books", { type: "cover", asset: X.x15, treatment: "driftLeft", transition: "cut" }],
  ["Professor X gets shot", { type: "cover", asset: X.x16, treatment: "driftRight", transition: "cut" }],
  ["a whole mess with Stryfe and Apocalypse", { type: "fan", assets: [X.x14, X.x15, X.x16], tint: "#c4122f", transition: "cut" }],
  ["Everybody is squinting", { type: "triptych", items: [{ asset: X.x14, focus: { x: 0.5, y: 0.55, zoom: 2.2 } }, { asset: X.x15, focus: { x: 0.45, y: 0.5, zoom: 2.2 } }, { asset: X.x16, focus: { x: 0.5, y: 0.5, zoom: 2.2 } }], title: "Squinty. Grizzled. Tough.", transitionIn: "cut" }],
  ["If the cartoon is your X-Men", { type: "media", asset: E.tasTeam, treatment: "slowPull", transitionIn: "cut" }],
  ["Fair warning it's messy", { type: "fan", assets: [X.x14, X.x15, X.x16], tint: "#c4122f", title: "Grab the trade paperback." }],

  // ── 4. God Loves, Man Kills ─────────────────────────────────────────────
  ["Number four God Loves Man Kills", { type: "cover", asset: E.glmk, treatment: "slowPush", number: 4, title: "God Loves, Man Kills", transitionIn: "cut" }],
  ["No continuity homework", { type: "cover", asset: E.glmk, treatment: "panDown" }],
  ["A preacher named William Stryker", { type: "cover", asset: E.glmkContext, treatment: "slowPush", transitionIn: "cut" }],
  ["Fear prejudice people being hated", { type: "cover", asset: E.glmk, treatment: "gentlePush", captionAlign: "right", title: "Fear • Prejudice • Persecution" }],
  ["It's also the backbone of the second X-Men movie", { type: "cover", asset: E.glmk, treatment: "still" }],

  // ── 5. House of M ───────────────────────────────────────────────────────
  ["Number five House of M", { type: "cover", asset: X.hom1, treatment: "slowPush", number: 5, title: "House of M", transitionIn: "cut" }],
  ["This is the book the guy at Graham Crackers handed me", { type: "cover", asset: X.hom1, treatment: "gentlePush", title: "The one that brought me back." }],
  ["The Scarlet Witch rewrites reality", { type: "cover", asset: X.hom8, treatment: "slowPush", transitionIn: "cut" }],
  ["It's an event book", { type: "pair", assets: [X.hom1, X.hom8] }],
  ["And the ending changed the X-Men", { type: "pair", assets: [X.hom1, X.hom8], field: "#5a0a14", tint: "#c4122f", float: true, title: "House of M" }],

  // ── Later: House of X / Powers of X ─────────────────────────────────────
  ["then read House of X and Powers of X", { type: "cover", asset: X.hox1, treatment: "slowPush", title: "Later: House of X / Powers of X", transitionIn: "cut" }],
  ["It's twelve issues that flip", { type: "grid", assets: HOXPOX, columns: 4, field: "#060909", tint: "#14b8a6" }],
  ["Remember X-Men 1", { type: "pair", assets: [{ asset: X.x1, label: "1963" }, { asset: X.hox1, label: "2019" }], field: "#060909", tint: "#14b8a6", transitionIn: "cut" }],
  ["It's brilliant It's also a lot", { type: "pair", assets: [X.hox6, X.pox6], field: "#060909", tint: "#14b8a6" }],
  ["So don't start there", { type: "grid", assets: HOXPOX, columns: 4, field: "#060909", tint: "#14b8a6", title: "Better after you have some history." }],

  // ── Shop like a kid ─────────────────────────────────────────────────────
  ["Here's my actual advice", { type: "chapter", title: "Shop like a kid." }],
  ["When you were ten", { type: "media", asset: E.longboxBroll, fallback: "stock/KID_BROWSING_COMICS", transitionIn: "cut" }],
  ["You grabbed whatever cover looked cool", { type: "stack", assets: [X.x14, X.u266, X.hom1] }],
  ["Find a character you like", { type: "media", asset: "stock/COMIC_PAGE_FLIP" }],
  ["For me it was Colossus", { type: "media", asset: E.colossusArt, position: COLOSSUS_FACE, treatment: "still", transition: "cut" }],
  ["For you it might be Storm", { type: "media", asset: E.storm, fallback: E.tasTeam, fallbackProps: STORM_IN_KEY_ART, treatment: "still", transition: "cut" }],
  ["Read their stories jump around", { type: "grid", assets: ALL_18, columns: 6, transitionIn: "cut" }],

  // ── ComixCatalog (Tony's on-camera spot will replace this block) ────────
  ["Quick one I built ComixCatalog", { type: "comixcatalog", tagline: "Catalog. Collect. Connect.", bug: true, transitionIn: "cut" }],
  ["You can search any of these books", { type: "screen", asset: "screenshots/CC_SEARCH_XMEN", focus: { x: 0.45, y: 0.55 }, bug: true }],
  ["see the covers", { type: "screen", asset: "screenshots/CC_ISSUE_PAGE", focus: { x: 0.4, y: 0.35 }, bug: true }],
  ["throw the ones you want on a wantlist", { type: "screen", asset: "screenshots/CC_WANTLIST", crop: { left: 60, top: 136, right: 24, bottom: 52 }, focus: { x: 0.4, y: 0.35 }, bug: true }],
  ["It's free to use", { type: "screen", asset: "screenshots/CC_HOME", focus: { x: 0.3, y: 0.3 }, bug: true }],

  // ── Outro ───────────────────────────────────────────────────────────────
  ["So the shelf", { type: "shelf", items: STARTER_SHELF, title: "The five-book starter shelf", transitionIn: "cut" }],
  ["And House of X and Powers of X when you're ready", { type: "shelfLater", items: STARTER_SHELF.map((i) => i.asset), later: HOXPOX, laterLabel: "Later" }],
  ["Don't turn reading comics into homework", { type: "chapter", title: "Don't turn reading comics\ninto homework." }],
  ["Go pick up a comic", { type: "end", title: "Go pick up a comic.\nTell me which one you started with." }],
];

const { times, misses } = resolveAnchors(words.words, CUES.map(([phrase]) => phrase));
if (misses.length) {
  console.warn(`timeline.v3: ${misses.length} anchor(s) not found in the transcript:\n` + misses.map((m) => `  #${m.index} "${m.phrase}"`).join("\n"));
}

const segments = CUES.map(([phrase, seg], i) => ({
  ...seg,
  at: +Math.max(0, VOICE_AT + times[i] - LEAD).toFixed(3),
  beat: phrase,
}));
// A fixed `dur` (GIF loops, the intro clip) can't run into the next shot.
segments.forEach((seg, i) => {
  const next = segments[i + 1];
  if (seg.dur != null && next && seg.at + seg.dur > next.at) delete seg.dur;
});

// ── Tony's on-camera ComixCatalog spot ──────────────────────────────────
// When the footage exists, set SPOT to its file and length in seconds. The
// narrated "Quick one. I built ComixCatalog..." paragraph is cut from the
// voice, the spot plays with its own sound, and everything after it moves.
const SPOT = null; // e.g. { asset: "broll/CC_SPOT.mp4", dur: 31.5 }
const SPOT_FROM = "Quick one I built ComixCatalog";
const SPOT_TO = "So the shelf";
let narrationClips = null;
let extra = 0;
if (SPOT) {
  const a = CUES.findIndex(([p]) => p === SPOT_FROM);
  const b = CUES.findIndex(([p]) => p === SPOT_TO);
  const cutFrom = times[a];
  const cutTo = times[b];
  extra = SPOT.dur - (cutTo - cutFrom);
  const spotAt = segments[a].at;
  segments.splice(a, b - a, { type: "media", asset: SPOT.asset, withAudio: true, treatment: "still", at: spotAt, transitionIn: "cut", transitionOut: "cut", beat: "ComixCatalog spot" });
  for (let i = a + 1; i < segments.length; i += 1) segments[i].at = +(segments[i].at + extra).toFixed(3);
  narrationClips = [
    { at: VOICE_AT, from: 0, to: cutFrom - 0.05 },
    { at: +(VOICE_AT + cutFrom + SPOT.dur).toFixed(3), from: cutTo - 0.05, to: null },
  ];
}

export const anchorMisses = misses;

// The sting hits with the title card.
const titleAt = segments.find((s) => s.beat === "Let's go")?.at ?? 0;

export default {
  id: "episode-001-v3",
  assetEpisodeId: "episode-001",
  outputDir: "episode-001",
  outputName: "episode-001-v3",
  compositionId: "Episode001V3",
  title: "Where to Start Reading X-Men Without Losing Your Mind (V3)",
  // Hold the end card a few seconds past the last word.
  duration: +(VOICE_AT + words.duration + 3 + extra).toFixed(3),
  nudges: [],
  audio: {
    narration: { asset: NARRATION, at: VOICE_AT, volume: 1, ...(narrationClips ? { clips: narrationClips } : {}) },
    // Music bed: ducked well under the voice, faded at both ends.
    music: { asset: "audio/MUSIC_BED", volume: 0.1, fadeIn: 2, fadeOut: 4, loop: true },
    // A louder sting under the title card.
    sting: { asset: "audio/MUSIC_STING", at: titleAt, dur: 7, volume: 0.3, fadeOut: 2 },
  },
  segments,
};
