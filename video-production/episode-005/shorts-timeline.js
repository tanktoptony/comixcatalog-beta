// Episode 005's three standalone Shorts on one clock (build_shorts_audio.py).
// ShortClip (src/Shorts.jsx) cuts each out by beat and frames it vertically,
// so every shot here is a full-bleed cover, album or one-line title card.
// No album audio: Rollin at 5 under Tony's voice.

import words from "./shorts.words.js";
import plan from "./shorts-plan.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";

export const shortsWords = words.words;
const c = (name) => `covers/${name}.jpg`;
const C = {
  s1: c("amory-wars-sstb-001-2007"), s2: c("amory-wars-sstb-002-2007"), s3: c("amory-wars-sstb-003-2007"), s4: c("amory-wars-sstb-004-2007"), s5: c("amory-wars-sstb-005-2007"),
  ii1: c("amory-wars-ii-001-2008"), ii2: c("amory-wars-ii-002-2008"), sult: c("amory-wars-sstb-ultimate-001-2010"),
};
const SSTB = "albums/2002-the-second-stage-turbine-blade.jpg";
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", transitionIn: "cut", ...extra });
const album = (extra = {}) => ({ type: "panel", asset: SSTB, size: [900, 900], treatment: "slowPush", transitionIn: "cut", ...extra });
const title = (t) => ({ type: "chapter", title: t, transitionIn: "cut" });
const art = (k) => ({ type: "cover", asset: `characters/${k}.png`, treatment: "slowPush", transitionIn: "cut" });

const CUES = [
  // Short 1 · the cast list
  ["first album has a cast list", album()],
  ["The album is The Second Stage", album({ treatment: "slowPull" })],
  ["It's the first chapter of a sci", cover(C.s1)],
  ["And the songs name the characters", title("The songs\nname names")],
  ["Time Consumer says goodnight", title("Matthew\nMaria")],
  ["They're the youngest kids", cover(C.s2)],
  ["33 names Patrick", title("Patrick")],
  ["He's engaged to their oldest", cover(C.s3)],
  ["Provision writes to", art("newo")],
  ["is Claudio's girlfriend", cover(C.ii1)],
  ["The same song names Norris and Larry", title("Norris\nLarry")],
  ["They're the two guys flying", cover(C.s4)],
  ["is addressed to Mariah", cover(C.s5)],
  ["Once you read the comics", cover(C.sult)],
  ["Every issue has a story", album()],
  // Short 2 · the couple
  ["The band Coheed and Cambria is named after", album()],
  ["in a comic book", cover(C.s1)],
  ["they're not a normal couple", cover(C.s4)],
  ["Coheed has blades built into", art("coheed")],
  ["his right arm turns into a gun", cover(C.s4, { treatment: "focus", focus: { x: 0.3, y: 0.4, zoom: 1.4 } })],
  ["Cambria can see things", art("cambria")],
  ["Before the kids and the house", cover(C.s2)],
  ["they were on a team called", title("K.B.I.")],
  ["Knowledge Beast and Inferno", title("The Knowledge\nThe Beast\nThe Inferno")],
  ["Then somebody wiped their memories", cover(C.s3)],
  ["That's the setup for the band's first album", album()],
  ["and the comics Claudio Sanchez wrote", cover(C.sult)],
  ["Every issue has a story", album({ treatment: "slowPull" })],
  // Short 3 · Jesse
  ["My favorite character in", cover(C.s5)],
  ["His name is Jesse", art("inferno")],
  ["He fights the tyrant", cover(C.s5, { treatment: "focus", focus: { x: 0.5, y: 0.75, zoom: 1.3 } })],
  ["next to his wife Mariah", art("mariah")],
  ["When Jesse finds out", cover(C.s2)],
  ["he doesn't wait around", cover(C.s4)],
  ["He chases down the ship", cover(C.ii2)],
  ["Then he calls his brother", cover(C.s4, { treatment: "focus", focus: { x: 0.45, y: 0.45, zoom: 1.5 } })],
  ["one hour", title("One hour")],
  ["That's why I like Jesse", cover(C.s5)],
  ["Revenge sacrifice", cover(C.ii2, { treatment: "focus", focus: { x: 0.5, y: 0.5, zoom: 1.4 } })],
  ["It's all in the Amory Wars", cover(C.sult)],
  ["Every issue has a story", album()],
];

const resolved = resolveAnchors(shortsWords, CUES.map(([p]) => p));
if (resolved.misses.length) throw new Error(`episode-005 shorts: unresolved anchors:\n${resolved.misses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - 0.1).toFixed(3), beat: phrase }));
// A blank marker closes each Short; each Short's first cue gets a stable beat name for shorts.js.
segments[0].at = 0;
plan.shorts.forEach((s) => segments.push({ type: "chapter", title: "", at: +(s.end + 0.2).toFixed(3), beat: `Short ${s.short} end` }));
segments.sort((a, b) => a.at - b.at);
plan.shorts.forEach((s) => { segments.find((x) => x.at >= s.at - 0.6 && !x.beat.startsWith("Short ")).beat = `Short ${s.short} start`; });

export default {
  id: "episode-005-shorts", assetEpisodeId: "episode-005", outputDir: "episode-005", outputName: "episode-005-shorts", compositionId: "Episode005Shorts",
  title: "Episode 005 Shorts", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/SHORTS_VOICE.wav", at: 0, volume: 1 },
    music: { asset: "audio/SHORTS_MUSIC.wav", volume: 1, fadeIn: 0, fadeOut: 0, loop: false },
  },
};
