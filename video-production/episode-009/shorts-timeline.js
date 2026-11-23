// Episode 009's three standalone Shorts on one clock (build_shorts_audio.py):
// the hidden track, Hello Apollo, and the convention exclusives. ShortClip
// (src/Shorts.jsx) cuts each out by beat and frames every shot full-bleed and
// vertical. Visuals follow Tony's SHORTS.md notes. No text cards.
//
// Horizontal framing: focus.x lands at that same fraction of the frame width
// (object-position), not the centre, so a point near an edge is framed with x near that edge.
// Zooms (Tony 11-22: be mindful of what a zoom lands on): every `at` below was
// placed on the named thing and checked on a still. The #1 convention cover is
// Al the Killer (forehead window); the #9 C2E2 cover is Claudio and Apollo
// outside Newo's house, which is the opening scene of the comic.

import words from "./shorts.words.js";
import plan from "./shorts-plan.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";

export const shortsWords = words.words;

const pad = (n) => String(n).padStart(2, "0");
const K = (n) => `covers/iksse-${pad(n)}.jpg`;
const CON1 = "covers/iksse-01-v01.jpg"; // "Convention exclusive limited to 500"
const C2E2_9 = "covers/iksse-09-v.jpg"; // "C2E2 exclusive limited to 300"
const ALL = Array.from({ length: 12 }, (_, i) => K(i + 1));
const IKS = "albums/2003-in-keeping-secrets-of-silent-earth-3.jpg";
const SSTB = "albums/2002-the-second-stage-turbine-blade.jpg";
const CD = "lore/iksse-cd.jpg";
const BOOKLET = "lore/iksse-booklet.jpg";
const NEWO = "characters/v-newo.png";
const TRACKS = "lore/iksse-tracklist-vertical.png"; // the back cover list, full width, under the captions
const POSTER = "lore/poster-neverender-iksse-2014.jpg"; // the earth-in-clouds IKSSE:3 art, vertical
const ULT = "covers/iksse-ultimate.jpg";
const BELL = "photos/purdue-bell-tower.jpg";

const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", transitionIn: "cut", ...extra });
const pull = (asset, extra = {}) => cover(asset, { treatment: "slowPull", ...extra });
const at = (asset, x, y, zoom, screenY = y, extra = {}) => cover(asset, { treatment: "zoomTo", focus: { x, y, zoom, screenY }, ...extra });
const cycle = (assets, extra = {}) => ({ type: "grid", assets, columns: assets.length, transitionIn: "cut", ...extra });

const CUES = [
  // Short 1 · The album with eleven silent tracks
  ["Imagine buying a CD", cover(CD)],
  ["getting to the end of the album", cover(TRACKS)],
  ["and finding eleven tracks of absolutely nothing", pull(BOOKLET)],
  ["That's what Coheed and Cambria did", cover(POSTER, { position: "50% 40%" })],
  ["After \"The Light & the Glass", at(TRACKS, 0.04, 0.916, 1.3, 0.8)],
  ["tracks twelve through twenty-two are silent", pull(CD)],
  ["But if you keep going", cover(BOOKLET)],
  ["A hidden, nearly ten-minute song", cover(IKS, { position: "50% 50%" })],
  ["It even reprises parts of", cover(SSTB)],
  ["Some digital versions removed", cycle([IKS, SSTB])],
  ["I loved finding stuff like this", pull(TRACKS)],
  ["It felt like a secret", cover(IKS)],

  // Short 2 · Hello Apollo (opens on the record's own line)
  ["Hello Apollo, where should I begin", cycle([IKS, K(1)])],
  ["That's the first spoken line", cover(IKS)],
  ["It's also how the comic starts", cover(K(1), { position: "50% 30%" })],
  ["Open the comic and it's the same scene", cover(C2E2_9, { position: "50% 55%" })],
  ["Claudio is talking to Apollo", at(C2E2_9, 0.4, 0.7, 1.4, 0.5)],
  ["outside Newo Ikkin's house", cover(NEWO)],
  ["I first heard this album in college", cover(BELL, { credit: "Purdue Bell Tower · Photo: A Hazy, CC BY-SA 4.0" })],
  ["More than twenty years later", cover(ULT, { position: "50% 40%" })],
  ["I'm still finding story in it", pull(K(1), { position: "50% 30%" })],

  // Short 3 · Convention exclusives
  ["You know what's dangerous", cover(K(1), { position: "50% 30%" })],
  ["Discovering that their comic books", cover(CON1, { position: "50% 40%" })],
  ["When BOOM! Studios published", cover(K(4), { position: "50% 40%" })],
  ["there were twelve issues", cycle(ALL)],
  ["Issue one had a convention-exclusive cover", at(CON1, 0.55, 0.42, 1.4, 0.4)],
  ["limited to five hundred copies", at(CON1, 0.9, 0.955, 1.0, 0.82)],
  ["Then issue nine got a C2E2 exclusive", cover(C2E2_9, { position: "50% 45%" })],
  ["limited to just three hundred copies", at(C2E2_9, 0.15, 0.96, 2.0, 0.82)],
  ["C2E2 is Chicago's comic con", at(C2E2_9, 0.55, 0.6, 1.4, 0.45)],
  ["I bought all twelve original issues", cycle(ALL)],
  ["but I don't have either of those exclusives", cycle([CON1, C2E2_9])],
  ["Believe me, I wish I did", pull(C2E2_9, { position: "50% 45%" })],
  ["So here's a question for the collectors", cover(CON1, { position: "50% 35%" })],
  ["Do you own one of these", cycle([CON1, C2E2_9])],
];

const resolved = resolveAnchors(shortsWords, CUES.map(([p]) => p));
if (resolved.misses.length) throw new Error(`episode-009 shorts: unresolved anchors:\n${resolved.misses.map((m) => `#${m.index} ${CUES[m.index][0]}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - 0.1).toFixed(3), beat: phrase }));
// A blank marker closes each Short; each Short's first cue gets a stable beat name for shorts.js.
segments[0].at = 0;
plan.shorts.forEach((s) => segments.push({ type: "chapter", title: "", at: +(s.end + 0.2).toFixed(3), beat: `Short ${s.short} end` }));
segments.sort((a, b) => a.at - b.at);
// Each Short starts where its audio starts: Short 2 opens on 2.3 s of the record before "Hello Apollo".
plan.shorts.forEach((s) => { const first = segments.find((x) => x.at >= s.at - 0.6 && !x.beat.startsWith("Short ")); first.beat = `Short ${s.short} start`; first.at = s.at; });

export default {
  id: "episode-009-shorts", assetEpisodeId: "episode-009", outputDir: "episode-009", outputName: "episode-009-shorts", compositionId: "Episode009Shorts",
  title: "Episode 009 Shorts", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/SHORTS_VOICE.wav", at: 0, volume: 1 },
    music: { asset: "audio/SHORTS_MUSIC.wav", volume: 1, fadeIn: 0, fadeOut: 0, loop: false },
  },
};
