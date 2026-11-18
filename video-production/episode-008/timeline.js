// Episode 008 · The Nice House on the Lake. Tony didn't film or record this
// one (2026-11-17): the whole script, ON CAMERA lines included, is his HeyGen
// clone (build_voice.py -> build_audio.py -> VOICE_PROGRAM.wav), and every
// bookshelf moment is covers and pages instead. Real imagery on every line:
// ComicVine covers, DC preview pages (Comic Watch / Graphic Policy posts),
// one Wikimedia Commons photo of Tynion (Gage Skidmore, CC BY-SA 2.0),
// live ComixCatalog pages. No text-only cards.
//
// Spoiler rules (RESEARCH.md): interiors only from Lake #1, 3, 6, 8, 9 and
// Sea #1-2; nothing from Lake #10-12 pages. Covers are fine.

import words from "./narration.words.js";
import plan from "./audio-plan.json" with { type: "json" };
import SIZES from "./sizes.js";
import { resolveAnchors } from "../shared/anchors.js";

const LEAD = 0.12;
export const narrationWords = words.words;

const pad = (n) => String(n).padStart(2, "0");
const L = (n) => `covers/lake-${pad(n)}.jpg`;
const S = (n) => `covers/sea-${pad(n)}.jpg`;
const V = (n) => `covers/lake-01-v${pad(n)}.jpg`; // the #1 variants
const LV = (n) => `covers/lake-${pad(n)}-v.jpg`; // later issues' variant
const TPB1 = "covers/lake-tpb-1.jpg";
const TPB2 = "covers/lake-tpb-2.jpg";
const DELUXE = "covers/lake-deluxe.jpg";
const FCBD = "covers/lake-fcbd.jpg";
const LAKE = Array.from({ length: 12 }, (_, i) => L(i + 1));
const SEA = Array.from({ length: 12 }, (_, i) => S(i + 1));
// Single-cover #1 variants (the even-numbered files are retailer two-up images).
const VARS = [1, 2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21].map(V);

const A = {
  l1Bar: "art/lake-01/cw06-the-nice-house-on-the-lake-1-5.jpg", // spread: the bar nights
  l1Brooklyn: "art/lake-01/cw05-the-nice-house-on-the-lake-1-4.jpg",
  l1Stairs: "art/lake-01/cw07-the-nice-house-on-the-lake-1-6.jpg", // "until I got the email"
  l1Email: "art/lake-01/cw08-the-nice-house-on-the-lake-1-7.jpg", // Walter's invitation
  l1Title: "art/lake-01/cw09-the-nice-house-on-the-lake-1-8.jpg", // title spread, house on the lake
  l1House: "art/lake-01-firstlook/cw02-nice-01-5.jpg",
  l3Boat: "art/lake-03/cw04-the-nice-house-on-the-lake-3-3.jpg",
  l3Red: "art/lake-03/cw05-the-nice-house-on-the-lake-3-4.jpg",
  l3Page: "art/lake-03/cw06-the-nice-house-on-the-lake-3-5.jpg",
  l3Title: "art/lake-03/cw07-the-nice-house-on-the-lake-3-credit.jpg",
  l6Blue: "art/lake-06/cw04-the-nice-house-on-the-lake-6-3.jpg",
  l6Storm: "art/lake-06/cw05-the-nice-house-on-the-lake-6-4.jpg",
  l6Page: "art/lake-06/cw06-the-nice-house-on-the-lake-6-5.jpg",
  l6House: "art/lake-06/cw07-the-nice-house-on-the-lake-6-6.jpg", // spread: the guests inside the house
  l8Page: "art/lake-08/cw05-capture-52.jpg",
  l8Spread: "art/lake-08/cw06-capture-53.jpg",
  l8Page2: "art/lake-08/cw07-capture-54.jpg",
  l8Shed: "art/lake-08/cw08-capture-55.jpg", // pencil design drawing
  l8Title: "art/lake-08/cw09-capture-56.jpg",
  l9Page: "art/lake-09/cw03-the-nice-house-on-the-lake-9-3.jpg",
  l9Spread: "art/lake-09/cw04-the-nice-house-on-the-lake-9-4.jpg",
  l9Page2: "art/lake-09/cw05-the-nice-house-on-the-lake-9-5.jpg",
  l9Note: "art/lake-09/cw06-the-nice-house-on-the-lake-9-6.jpg", // "He has taken your memories"
  l9Title: "art/lake-09/cw07-the-nice-house-on-the-lake-9-7.jpg",
  seaCast: "art/sea-cast/05-tnhbts-preview-2.jpg",
  seaPostcard: "art/sea-cast/03-tnhbts-cv1-var-00141-digital.jpg",
  seaMaxEmail: "art/sea-cast/09-tnhbts-preview-6.jpg",
  seaRoles: "art/sea-cast/13-tnhbts-preview-10.jpg",
  seaBeach: "art/sea-01/02-the-nice-house-by-the-sea-1-2.jpg",
  seaFaces: "art/sea-01/03-the-nice-house-by-the-sea-1-3.jpg",
  seaTitle: "art/sea-01/06-the-nice-house-by-the-sea-1-6.jpg",
  sea2Spread: "art/sea-02/03-the-nice-house-by-the-sea-2-3.jpg",
  tynion: "photos/tynion-gage-skidmore-2018.jpg",
};
const PHOTO = "Photo: Gage Skidmore, CC BY-SA 2.0";

const cut = { transitionIn: "cut" };
const size = (asset) => SIZES[asset] ?? [1000, 1500];
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...cut, ...extra });
const pull = (asset, extra = {}) => cover(asset, { treatment: "slowPull", ...extra });
const cap = (asset, title, sub, kicker, extra = {}) => cover(asset, { title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), ...extra });
// zoomTo: starts on the band at focus.y, so the target is in frame from the first frame.
const zoom = (asset, x, y, z, extra = {}) => cover(asset, { treatment: "zoomTo", focus: { x, y, zoom: z }, ...extra });
// The symbol row sits at ~12.5% of a Lake main cover's height.
const ROW_Y = 0.125;
const row = (n, x = 0.5, z = 2.4) => zoom(L(n), x, ROW_Y, z);
const grid = (assets, extra = {}) => ({ type: "grid", assets, columns: Math.min(assets.length, 6), ...cut, ...extra });
const fan = (assets, extra = {}) => ({ type: "fan", assets, ...cut, ...extra });
const pair = (a, la, b, lb, extra = {}) => ({ type: "pair", assets: [{ asset: a, label: la }, { asset: b, label: lb }], ...cut, ...extra });
const p = (asset, extra = {}) => ({ type: "panel", asset, size: size(asset), treatment: "slowPush", maxUpscale: 2, ...cut, ...extra });
const pp = (asset, title, sub, kicker, extra = {}) => p(asset, { ...(title ? { title } : {}), ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), ...extra });
const site = (asset, x, y, z, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment: "push", focus: { x, y }, zoom: z, centerFocus: true, ...cut, ...extra });

// [anchor phrase, segment]
const CUES = [
  // ── 01 Cold open ──────────────────────────────────────────────────────────
  ["There's a reason I love comics that make you suspicious", p(A.l1House, { transitionIn: "fade", fadeIn: 12 })],
  ["Especially when the weirdest guy in the room", zoom(DELUXE, 0.47, 0.36, 2.0)],

  // ── 02 The recommendation ─────────────────────────────────────────────────
  ["A few years ago, I picked up a comic", cover(L(1))],
  ["It was recommended to me by Challengers", cover(TPB1)],
  ["right across the street from the bar where I used to work", p(A.l1Bar)],
  ["Apparently, working in a bar wasn't enough", grid(VARS.slice(0, 6), { columns: 6 })],
  ["I don't read a ton of horror comics", cover(L(2))],
  ["I've read The Walking Dead", cap("covers/walking-dead-001-2003.jpg", "The Walking Dead #1", "Image Comics, 2003")],
  ["but horror isn't necessarily what sends me", cover(L(4))],
  ["I do, however, love a good mystery", p(A.l1Stairs)],
  ["And that's what grabbed me about this book", cover(LV(7))],
  ["I love stories where you're trying to figure things out", p(A.l6House)],
  ["Where everybody has a piece of the puzzle", cover(V(2))],
  ["you start questioning what you know about each person", p(A.l3Red)],
  ["It's one of the reasons I enjoy the Knives Out", p(A.l8Spread)],
  ["scratches that same itch", pull(TPB1)],
  ["It just happens to be considerably more disturbing", zoom(L(1), 0.56, 0.7, 2.2)],

  // ── 03 The invitation ─────────────────────────────────────────────────────
  ["The setup is simple enough", cover(LV(12))],
  ["There's a guy named Walter", zoom(DELUXE, 0.47, 0.36, 2.2)],
  ["And he invites a group of his friends", zoom(A.l1Email, 0.45, 0.22, 1.7)],
  ["You've got ten guests, mostly people in their thirties", cover(FCBD)],
  ["And Walter has apparently arranged everything", pull(A.l1Email)],
  ["The house is gorgeous", p(A.l8Title)],
  ["You can basically have whatever you want", cover(L(8))],
  ["There's just one small complication", p(A.l1Stairs, { treatment: "slowPull" })],
  ["The world outside ends", zoom(L(5), 0.5, 0.35, 1.8)],
  ["And now everybody's stuck there", cover(L(6))],
  ["You can't leave the house", p(A.l6Storm)],
  ["Everything you knew outside those walls", cover(L(4), { treatment: "slowPull" })],
  ["Meanwhile, Walter seems to know considerably more", cover(LV(6))],
  ["So naturally, you're going to have a few questions for Walter", p(A.l3Boat)],
  ["And you're probably going to be a little irritated", cover(V(1))],
  ["What's so effective about the premise", p(A.l3Page)],
  ["Why these people", p(A.l6House, { treatment: "slowPull" })],
  ["Why this house", cover(LV(5))],
  ["Why Walter", zoom(DELUXE, 0.47, 0.34, 2.6)],
  ["what exactly is Walter", cover(LV(3))],

  // ── 04 The people ─────────────────────────────────────────────────────────
  ["One of my favorite things about the concept", p(A.l9Spread)],
  ["Each guest has a role", grid(LAKE.slice(0, 10), { columns: 5 })],
  ["It's an odd assortment of people", pp(A.seaCast, undefined, undefined, "The Nice House by the Sea's cast, for comparison")],
  ["these aren't necessarily the people you'd expect", p(A.l8Page)],
  ["They've got different personalities", cover(L(7))],
  ["different relationships with Walter", cover(L(9))],
  ["different ways of responding to what's happening", cover(L(3))],
  ["And Walter knows them", p(A.l1Brooklyn, { treatment: "slowPull" })],
  ["That's what makes the whole thing feel so deliberately constructed", p(A.l8Shed)],
  ["You've got this strange little collection of people", cover(DELUXE)],
  ["And as a reader, you're doing the same thing", p(A.l9Page)],
  ["You're trying to understand why each person matters", p(A.l6Page)],
  ["You start developing theories", p(A.l8Page2)],
  ["You start paying attention to conversations", p(A.l9Page2)],
  ["I love that kind of storytelling", cover(L(11))],
  ["Give me a mystery that rewards paying attention", cover(L(10))],

  // ── 05 The covers ─────────────────────────────────────────────────────────
  ["And this is where the comics themselves", grid(LAKE, { columns: 6 })],
  ["Take a look at the covers", cover(L(1), { treatment: "still" })],
  ["Under the title, there's this little row of ten symbols", row(1, 0.5, 1.5)],
  ["You might initially assume they're decorative", row(2, 0.4)],
  ["But each symbol corresponds to one of the guests", row(4)],
  ["And each issue highlights a different one", row(8)],
  ["Issue three highlights the third symbol", row(3, 0.36, 2.8)],
  ["Issue seven highlights the seventh", row(7, 0.6, 2.8)],
  ["The story is organized around these characters", pair(L(3), "Book Three", L(7), "Book Seven")],
  ["There's even an additional symbol that appears in the row on Book Six", row(6, 0.49, 2.8)],
  ["I really appreciate when creators do this kind of thing", grid(LAKE, { columns: 6, push: 0.03 })],
  ["Because it gives you another reason to go back", cover(L(9))],
  ["And when you're reading a collected edition, like I was", pair(TPB1, "Vol. 1", TPB2, "Vol. 2")],
  ["There's something satisfying about realizing", zoom(TPB2, 0.5, 0.13, 2.2)],
  ["You just didn't necessarily know what you were looking at", row(10, 0.68, 2.2)],

  // ── 06 The creative team ──────────────────────────────────────────────────
  ["The book was written by James Tynion", p(A.l1Title)],
  ["It came out through DC's Black Label imprint", zoom(L(1), 0.5, 0.88, 2.4)],
  ["The first issue arrived in June of 2021", cap(L(1), "The Nice House on the Lake #1", "On sale June 1, 2021")],
  ["the original series ran for twelve issues", grid(LAKE, { columns: 6 })],
  ["I think the artwork is a big part of why the premise works", cover(LV(3), { treatment: "slowPull" })],
  ["You've got this beautiful setting", cover(L(12))],
  ["this growing sense that something is profoundly wrong", cover(L(7))],
  ["It's a great contrast", cover(L(8), { treatment: "slowPull" })],
  ["The setting almost feels too comfortable", cover(LV(2))],
  ["And the character-driven structure", p(A.l8Page2)],
  ["A conversation in a beautiful house", p(A.l1Bar, { treatment: "slowPull" })],
  ["you don't need a haunted basement", cover(L(9), { treatment: "slowPull" })],
  ["And Tynion has talked pretty openly", pp(A.tynion, undefined, undefined, `James Tynion IV, 2018 · ${PHOTO}`)],
  ["Which brings us to something I found particularly interesting about Walter", cover(V(1))],

  // ── 07 The Walter problem ─────────────────────────────────────────────────
  ["Walter might be the most interesting part", zoom(DELUXE, 0.47, 0.36, 2.2)],
  ["And when you hear what James Tynion has said about him", pp(A.tynion, undefined, undefined, PHOTO)],
  ["At C2E2 in 2026, Tynion talked about", pp(A.tynion, "“The Nice House on the Lake is a very personal horror story for me.”", "James Tynion IV at C2E2 2026, via Popverse", undefined, { treatment: "slowPull" })],
  ["He described Walter as a villain based on himself", cap(DELUXE, "“The villain of that story is very much based on me. The character of Walter.”", "James Tynion IV, C2E2 2026")],
  ["He even said Walter looks like him on purpose", pair(A.tynion, "James Tynion IV", DELUXE, "Walter, center")],
  ["Now, obviously, I'm not suggesting James Tynion", zoom(A.l1Email, 0.45, 0.35, 1.7)],
  ["Although if he does invite you somewhere", p(A.l9Title, { treatment: "slowPull" })],
  ["But that detail changes how I think about the character", cover(LV(6), { treatment: "slowPull" })],
  ["Because Walter is such a strange combination of things", cover(L(6))],
  ["He's familiar to these people", p(A.l3Boat, { treatment: "slowPull" })],
  ["He also happens to be hiding something rather significant", p(A.l6Blue)],
  ["And there's this uncomfortable relationship", p(A.l6House)],
  ["You can interpret quite a bit through that relationship", p(A.l8Page)],
  ["Especially knowing the writer deliberately put something of himself", zoom(DELUXE, 0.47, 0.34, 2.6, { treatment: "focusOut" })],

  // ── 08 The success ────────────────────────────────────────────────────────
  ["And this wasn't some obscure little book", cover(TPB2)],
  ["won the Eisner Award for Best New Series in 2022", zoom(TPB2, 0.55, 0.92, 1.7)],
  ["Tynion also won Best Writer that year", pp(A.tynion, "Eisner Awards 2022", "Best New Series and Best Writer", PHOTO)],
  ["In 2023, Tynion won Best Writer again", pp(A.l3Red, "Eisner Awards 2023", "Tynion, Best Writer. Jordie Bellaire, Best Coloring.", "The Nice House on the Lake #3 · colors by Jordie Bellaire")],
  ["The series also picked up a major award at the Angoulême", cap(TPB2, "Angoulême 2024", "Prix de la Série, for the French edition of Vol. 2 (Urban Comics)")],
  ["So clearly, quite a few people thought this was worth reading", zoom(TPB1, 0.52, 0.93, 1.4)],
  ["The first issue even went back for a second printing", cover(V(17))],
  ["there's an enormous assortment of variant covers", grid(VARS, { columns: 6 })],
  ["ComicVine lists twenty-one variants", grid(VARS.slice(6), { columns: 6, title: "21 variant and retailer covers for #1", sub: "Source: ComicVine" })],
  ["As somebody interested in the collecting side of comics", cover(V(9))],
  ["You've got all these different artistic interpretations", cover(V(5))],
  ["some with very different approaches to the cover", pair(V(11), "", V(15), "")],
  ["And yet, the regular covers have their own little visual language", grid(LAKE, { columns: 6 })],
  ["I think that makes them especially satisfying to see together", fan(LAKE.slice(0, 7))],

  // ── 09 Back to the house ──────────────────────────────────────────────────
  ["One thing worth mentioning is that I read", pair(TPB1, "Vol. 1", TPB2, "Vol. 2")],
  ["And for a story like this", cover(DELUXE, { treatment: "slowPull" })],
  ["You've got twelve issues to work through", fan(LAKE.slice(5))],
  ["The original series had a couple of publication breaks", cover(L(6), { treatment: "slowPull" })],
  ["There was a gap between issues six and seven", pair(L(6), "#6 · November 16, 2021", L(7), "#7 · March 1, 2022")],
  ["and another between nine and ten", pair(L(9), "#9 · May 31, 2022", L(10), "#10 · September 27, 2022")],
  ["So readers following it monthly", p(A.l9Page)],
  ["I can certainly appreciate the appeal of that", p(A.l9Page2, { treatment: "slowPull" })],
  ["But personally, I tend to enjoy sitting down with a trade paperback", cover(TPB1)],
  ["Especially with mysteries", p(A.l8Page2, { treatment: "slowPull" })],
  ["I want to remember the little details", p(A.l3Page, { treatment: "slowPull" })],
  ["And this book gives you plenty of things worth remembering", cover(TPB2, { treatment: "slowPull" })],

  // ── 10 Spoiler territory ──────────────────────────────────────────────────
  ["I'm going to touch on a couple of developments", cap(L(6), "Spoiler warning", "A few things from the middle of the first series. Nothing about the ending.", "Skip ahead to go in cold")],
  ["One of the interesting things about the house", p(A.l6House, { treatment: "slowPull" })],
  ["People can't die or get hurt inside it", p(A.l6Storm, { treatment: "slowPull" })],
  ["And the idea of being able to have essentially anything", cover(L(8))],
  ["Then there's Reg", row(6, 0.49, 2.8)],
  ["And that's a pretty significant complication", p(A.l8Shed, { treatment: "slowPull" })],
  ["There's also the matter of Walter resetting", p(A.l9Note)],
  ["Which is a fairly rude thing to do to your friends", cover(LV(6))],
  ["Especially considering the circumstances", cover(L(5))],
  ["All these developments add new questions", p(A.l9Spread, { treatment: "slowPull" })],
  ["And once you realize just how much control Walter has", cover(V(2), { treatment: "slowPull" })],

  // ── 11 The house by the sea ───────────────────────────────────────────────
  ["Now, there's a reason I wanted to revisit this series", cap(S(1), "The Nice House by the Sea", "Spoilers over", undefined, { captionAlign: "right" })],
  ["In July of 2024, Tynion and the same creative team", p(A.seaTitle)],
  ["And as of October 2026, all twelve issues", grid(SEA, { columns: 6 })],
  ["That means the full twenty-four-issue saga", grid([...LAKE, ...SEA], { columns: 8 })],
  ["The second series brings us to a different house", p(A.seaBeach)],
  ["This one's by the sea, naturally", p(A.seaPostcard)],
  ["And there's a new host named Max", p(A.seaMaxEmail)],
  ["This time, instead of a group of friends", p(A.seaCast)],
  ["You've got another collection of people assigned different roles", p(A.seaRoles)],
  ["And according to Tynion, the relationships are considerably more antagonistic", pp(A.seaFaces, "“This is a house of strangers and tension much more than a house of friendship.”", "James Tynion IV to CBR, 2024")],
  ["These people don't particularly like one another", p(A.sea2Spread)],
  ["Which sounds like a wonderful way to spend the apocalypse", cover(S(2))],
  ["I haven't made it through By the Sea yet", cover(S(1), { treatment: "slowPull" })],
  ["In fact, I want to go back through Lake", cover(TPB1)],
  ["But the idea of taking that original premise", pair(L(1), "The Nice House on the Lake", S(1), "The Nice House by the Sea")],
  ["through a completely different set of relationships", pair(S(6), "#6", S(7), "#7")],
  ["And now that the entire run is finished", cover(S(12))],

  // ── 12 The recommendation ─────────────────────────────────────────────────
  ["So if you're somebody who enjoys a mystery", cover(L(1))],
  ["You don't have to be a big horror-comics reader", cover(L(2), { treatment: "slowPull" })],
  ["And that's part of what made this one stand out", cover(DELUXE)],
  ["The premise is fascinating", zoom(DELUXE, 0.47, 0.36, 2.2)],
  ["I'm looking forward to revisiting it", pair(L(1), "The Nice House on the Lake", S(1), "The Nice House by the Sea")],
  ["both series are listed on ComixCatalog", site("cc-series-lake", 0.5, 0.25, 1.1)],
  ["with the individual covers, printable checklists", site("cc-series-lake", 0.3, 0.8, 1.35)],
  ["and options to track what you own", site("cc-series-lake", 0.45, 0.48, 1.4)],
  ["If you've read either series", site("cc-series-sea-grid", 0.5, 0.4, 1.3)],
  ["And subscribe if you'd like to see more comics", fan([S(1), L(3), S(6), L(7), S(12), L(1)])],
];

const anchors = CUES.map((c) => c[0]);
const resolved = resolveAnchors(narrationWords, anchors);
export const anchorMisses = resolved.misses.map((m) => ({ ...m, phrase: anchors[m.index] }));
if (anchorMisses.length) throw new Error(`episode-008: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);

const segments = CUES.map(([anchor, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - LEAD).toFixed(3), beat: anchor }));
// The cold open starts on picture with the first word.
segments[0].at = 0;
segments.push({ type: "sting", at: plan.sting.at, beat: "Channel sting", transitionOut: "cut", fadeIn: 8, tagline: "Catalog. Collect. Connect." });
segments.push({ type: "end", at: plan.endCard, dur: plan.duration - plan.endCard, beat: "End card", title: "Read either series?", sub: "Tell me what you thought in the comments", transitionIn: "cut" });
segments.sort((x, y) => x.at - y.at);

export default {
  id: "episode-008", assetEpisodeId: "episode-008", outputDir: "episode-008", outputName: "episode-008", compositionId: "Episode008",
  title: "The Nice House on the Lake", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/VOICE_PROGRAM.wav", at: 0, volume: 1 },
    // Same bed and levels as Ep 006/007: Double Drift stored 6 dB down. TTS is denser than a live read, so 0.4 like Ep 006 (also TTS).
    music: { asset: "audio/MUSIC_BED_DOUBLE_DRIFT.wav", volume: 0.4, fadeIn: 2, fadeOut: 4, loop: false, duck: [{ from: plan.sting.at + 0.35, to: plan.sting.at + plan.sting.dur }] },
    sting: { asset: "audio/MUSIC_STING.mp3", at: plan.sting.at, from: 7.1, dur: plan.sting.dur, volume: 0.7, fadeIn: 0.15, fadeOut: 0.4 },
  },
};
