// Episode 006's three standalone Shorts on one clock (build_shorts_audio.py).
// ShortClip (src/Shorts.jsx) cuts each out by beat and frames it vertically,
// so every shot is a full-bleed cover or a vertical Power Profile card still
// (cards/v-*.png: the card on its backdrop at 1080x1920; the overlay versions
// are frames from the episode render).

import words from "./shorts.words.js";
import plan from "./shorts-plan.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";

export const shortsWords = words.words;
const c = (name) => `covers/${name}.jpg`;
const C = {
  ff5: c("fantastic-four-005-1962"), ff57: c("fantastic-four-057-1966"), ff58: c("fantastic-four-058-1967"), ff59: c("fantastic-four-059-1967"), ff60: c("fantastic-four-060-1967"),
  ff84: c("fantastic-four-084-1969"), tt: c("triumph-and-torment-001-1989"), mgn27: c("marvel-graphic-novel-027-1987"), iim1: c("infamous-iron-man-001-2016"),
  dd2019: c("doctor-doom-001-2019"), doom24: c("doom-001-2024"), owud1: c("one-world-under-doom-001-2025"), bh5: c("blood-hunt-005-2024"), bod2: c("books-of-doom-002-2006"),
  sw1: c("secret-wars-001-1984"), sw9: c("secret-wars-009-1984"), sw10: c("secret-wars-010-1984"), sw11: c("secret-wars-011-1984"), sw12: c("secret-wars-012-1984"),
  s1: c("secret-wars-001-2015"), s2: c("secret-wars-002-2015"), s9: c("secret-wars-009-2015"),
};
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", transitionIn: "cut", ...extra });
const card = (k, extra = {}) => ({ type: "cover", asset: `cards/v-${k}.png`, treatment: "slowPush", transitionIn: "cut", ...extra });

const CUES = [
  // Short 1 · not Iron Man with a cape
  ["Doctor Doom is not Iron Man with a cape", cover(C.iim1)],
  ["In 1989 Marvel put out Triumph and Torment", cover(C.tt, { title: "Triumph and Torment · 1989" })],
  ["It opens with a contest", cover(C.tt, { treatment: "slowPull" })],
  ["And Doom gets one rule", cover(C.doom24)],
  ["He does it And it comes down to two guys", cover(C.tt)],
  ["Strange keeps the title", card("sorcery")],
  ["Strange is worried Doom's going to ask", cover(C.mgn27)],
  ["Doom says he doesn't need help with that", cover(C.owud1)],
  ["What he wants is his mother's soul", cover(C.bod2)],
  ["So yeah he builds the armor", card("back")],
  ["He also nearly won the Sorcerer Supreme title", card("sorcery")],
  ["And in 2024 he finally got the title", cover(C.bh5, { title: "Blood Hunt #5 · 2024" })],
  ["He just never gave it back", cover(C.owud1, { treatment: "slowPull" })],
  ["The full Doom Power Profile is on the channel", card("front")],
  // Short 2 · the Silver Surfer heist
  ["Doctor Doom once stole the Silver Surfer's powers", cover(C.ff57)],
  ["Fantastic Four 57 1966", cover(C.ff57, { title: "Fantastic Four #57 · 1966", treatment: "slowPull" })],
  ["Doom invites the Surfer over to Latveria", cover(C.ff84)],
  ["Then in the lab he distracts him", cover(C.ff57)],
  ["and drains the Power Cosmic", card("cosmic")],
  ["Takes the board too", cover(C.ff58)],
  ["Next issue he flattens the Fantastic Four", cover(C.ff58, { treatment: "slowPull" })],
  ["So how do you beat that", cover(C.ff59)],
  ["In issue 60 Reed sends a little flying wing", cover(C.ff60, { title: "Fantastic Four #60 · 1967" })],
  ["Flash Power gone", card("back")],
  ["Reed didn't out-punch him", cover(C.ff60, { treatment: "slowPull" })],
  ["Fantastic Four 57 through 60", cover(C.ff57, { title: "Fantastic Four #57 to #60" })],
  // Short 3 · why God Emperor Doom doesn't count
  ["When people say Doctor Doom beat the Beyonder", cover(C.sw11)],
  ["Here's Marvel's own power grid for Doom", card("back")],
  ["That's Doom in his armor", cover(C.doom24)],
  ["Now 1984 The original Secret Wars", cover(C.sw1, { title: "Secret Wars · 1984" })],
  ["Doom builds a machine out of a villain named Klaw", cover(C.sw9)],
  ["Uses it to drain Galactus", cover(C.sw10)],
  ["Then takes the Beyonder's power", card("beyonder")],
  ["He's a god for about two issues", cover(C.sw11, { treatment: "slowPull" })],
  ["until his own doubts let the Beyonder take it back", cover(C.sw12)],
  ["2015 Jonathan Hickman's Secret Wars", cover(C.s1, { title: "Secret Wars · 2015" })],
  ["Doom gets the power of the Beyonders", cover(C.s2)],
  ["God Emperor Doom", card("godemperor")],
  ["And at the end he admits Reed would have done better", cover(C.s9)],
  ["Borrowed power Temporary every time", card("godemperor")],
  ["So on our card it's an overlay", card("back")],
  ["Standard Doom is scary enough", cover(C.dd2019)],
  ["Full Power Profile on the channel", card("front")],
];

const resolved = resolveAnchors(shortsWords, CUES.map(([p]) => p));
if (resolved.misses.length) throw new Error(`episode-006 shorts: unresolved anchors:\n${resolved.misses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - 0.1).toFixed(3), beat: phrase }));
// A blank marker closes each Short; each Short's first cue gets a stable beat name for shorts.js.
segments[0].at = 0;
plan.shorts.forEach((s) => segments.push({ type: "chapter", title: "", at: +(s.end + 0.2).toFixed(3), beat: `Short ${s.short} end` }));
segments.sort((a, b) => a.at - b.at);
plan.shorts.forEach((s) => { segments.find((x) => x.at >= s.at - 0.6 && !x.beat.startsWith("Short ")).beat = `Short ${s.short} start`; });

export default {
  id: "episode-006-shorts", assetEpisodeId: "episode-006", outputDir: "episode-006", outputName: "episode-006-shorts", compositionId: "Episode006Shorts",
  title: "Episode 006 Shorts", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/SHORTS_VOICE.wav", at: 0, volume: 1 },
    music: { asset: "audio/SHORTS_MUSIC.wav", volume: 1, fadeIn: 0, fadeOut: 0, loop: false },
  },
};
