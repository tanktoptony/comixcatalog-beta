// Episode 008's three standalone Shorts on one clock (build_shorts_audio.py):
// the cover symbols, the premise, and Walter being based on Tynion. ShortClip
// (src/Shorts.jsx) cuts each out by beat and frames every shot full-bleed and
// vertical. Same art and spoiler rules as the episode (timeline.js): interiors
// only from Lake #1, 3, 6, 8, 9; covers are fine. No text cards.
//
// The symbol row sits at the top of each cover, behind the hook, so row
// zooms carry focus.screenY to bring the row down into the open frame.

import words from "./shorts.words.js";
import plan from "./shorts-plan.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";

export const shortsWords = words.words;

const pad = (n) => String(n).padStart(2, "0");
const L = (n) => `covers/lake-${pad(n)}.jpg`;
const S = (n) => `covers/sea-${pad(n)}.jpg`;
const LV = (n) => `covers/lake-${pad(n)}-v.jpg`;
const TPB2 = "covers/lake-tpb-2.jpg";
const DELUXE = "covers/lake-deluxe.jpg";
const LAKE = Array.from({ length: 12 }, (_, i) => L(i + 1));
const A = {
  l1Email: "art/lake-01/cw08-the-nice-house-on-the-lake-1-7.jpg",
  l1Title: "art/lake-01/cw09-the-nice-house-on-the-lake-1-8.jpg",
  l1Stairs: "art/lake-01/cw07-the-nice-house-on-the-lake-1-6.jpg",
  l1House: "art/lake-01-firstlook/cw02-nice-01-5.jpg",
  l3Page: "art/lake-03/cw06-the-nice-house-on-the-lake-3-5.jpg",
  l3Credits: "art/lake-03/cw07-the-nice-house-on-the-lake-3-credit.jpg",
  l6Storm: "art/lake-06/cw05-the-nice-house-on-the-lake-6-4.jpg",
  l6Blue: "art/lake-06/cw04-the-nice-house-on-the-lake-6-3.jpg",
  l6House: "art/lake-06/cw07-the-nice-house-on-the-lake-6-6.jpg",
  tynion: "photos/tynion-gage-skidmore-2018.jpg",
};
const PHOTO = "Photo: Gage Skidmore, CC BY-SA 2.0";

const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", transitionIn: "cut", ...extra });
const pull = (asset, extra = {}) => cover(asset, { treatment: "slowPull", ...extra });
const at = (asset, x, y, zoom, screenY = y, extra = {}) => cover(asset, { treatment: "zoomTo", focus: { x, y, zoom, screenY }, ...extra });
// The symbol row: ~12.5% down a Lake main cover, brought to 34% of the frame.
const row = (n, x = 0.5, z = 2.4) => at(L(n), x, 0.125, z, 0.34);
const cycle = (assets, extra = {}) => ({ type: "grid", assets, columns: assets.length, transitionIn: "cut", ...extra });
const walter = (z = 2.2) => at(DELUXE, 0.47, 0.36, z, 0.42);
// The title spreads: the lit house is up and to the right; the middle is the credits block.
const house = (asset, z = 1.6) => at(asset, 0.72, 0.2, z, 0.42);

const CUES = [
  // Short 1 · The secret on every cover
  ["Every cover of The Nice House on the Lake", cover(L(1), { position: "50% 20%" })],
  ["has the same little row of ten symbols", row(1, 0.5, 1.6)],
  ["They look like decoration", row(2, 0.4)],
  ["They're not", row(4, 0.5, 2.8)],
  ["Each one stands for one of the ten guests", cover(A.l6House)],
  ["Walter invited to his lake house", walter()],
  ["And each issue lights up a different one", cycle([L(2), L(4), L(5), L(8)], { focus: { x: 0.5, y: 0.125, zoom: 2.4, screenY: 0.34 } })],
  ["Issue three lights the third", row(3, 0.36, 2.8)],
  ["Issue seven lights the seventh", row(7, 0.6, 2.8)],
  ["So the cover tells you whose story", pull(L(7), { position: "50% 20%" })],
  ["before you even open it", cover(A.l3Page)],
  ["Book Six even adds a symbol", row(6, 0.49, 2.8)],
  ["Twelve issues", cycle([L(1), L(2), L(4), L(5), L(8), L(9), L(10), L(11)])],
  ["Go count them", row(12, 0.5, 1.6)],

  // Short 2 · Your weird friend invites you to a lake house
  ["Your slightly weird friend Walter", walter()],
  ["invites you and a bunch of your friends", at(A.l1Email, 0.45, 0.3, 1.4, 0.45)],
  ["to spend a week at a gorgeous lake house", house(A.l1Title)],
  ["Everything's arranged", cover(A.l6House)],
  ["You can have pretty much whatever you want", cover(L(8))],
  ["Then the world outside ends", at(L(5), 0.5, 0.35, 1.8, 0.45)],
  ["You can't leave", cover(A.l6Storm)],
  ["You can't go home", cover(L(6))],
  ["And Walter seems to know a lot more", cover(LV(6))],
  ["That's The Nice House on the Lake", cover(L(1), { position: "50% 20%" })],
  ["A twelve-issue horror mystery", cycle(LAKE)],
  ["by James Tynion the Fourth", at(A.l3Credits, 0.14, 0.87, 1.3, 0.5)],
  ["It won the Eisner for Best New Series", at(TPB2, 0.55, 0.92, 1.7, 0.45)],
  ["And the sequel finished in October", cover(S(1))],
  ["so the whole story is out now", pull(S(12))],

  // Short 3 · The villain is the writer
  ["In The Nice House on the Lake", cover(L(1), { position: "50% 20%" })],
  ["a guy named Walter invites his friends", at(A.l1Email, 0.45, 0.3, 1.4, 0.45)],
  ["right before the world ends", at(L(5), 0.5, 0.35, 1.8, 0.45)],
  ["He knows more than he's telling", cover(LV(6))],
  ["He's the villain", walter(2.6)],
  ["And at C2E2 this year", cover(A.tynion, { title: "James Tynion IV", credit: PHOTO })],
  ["said Walter is based on himself", walter()],
  ["He even said Walter looks a lot like him", cover(A.tynion, { credit: PHOTO })],
  ["On purpose", walter(2.8)],
  ["He called it a very personal horror story", cover(A.l6Blue)],
  ["So if a comic writer ever invites you somewhere", pull(A.l1Email)],
  ["maybe ask a couple of follow-up questions", house(A.l1House, 1.4)],
];

const resolved = resolveAnchors(shortsWords, CUES.map(([p]) => p));
if (resolved.misses.length) throw new Error(`episode-008 shorts: unresolved anchors:\n${resolved.misses.map((m) => `#${m.index} ${CUES[m.index][0]}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - 0.1).toFixed(3), beat: phrase }));
// A blank marker closes each Short; each Short's first cue gets a stable beat name for shorts.js.
segments[0].at = 0;
plan.shorts.forEach((s) => segments.push({ type: "chapter", title: "", at: +(s.end + 0.2).toFixed(3), beat: `Short ${s.short} end` }));
segments.sort((a, b) => a.at - b.at);
plan.shorts.forEach((s) => { segments.find((x) => x.at >= s.at - 0.6 && !x.beat.startsWith("Short ")).beat = `Short ${s.short} start`; });

export default {
  id: "episode-008-shorts", assetEpisodeId: "episode-008", outputDir: "episode-008", outputName: "episode-008-shorts", compositionId: "Episode008Shorts",
  title: "Episode 008 Shorts", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/SHORTS_VOICE.wav", at: 0, volume: 1 },
    music: { asset: "audio/SHORTS_MUSIC.wav", volume: 1, fadeIn: 0, fadeOut: 0, loop: false },
  },
};
