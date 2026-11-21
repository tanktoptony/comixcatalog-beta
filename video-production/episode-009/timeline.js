// The Amory Wars, Part 3 (channel episode 009): In Keeping Secrets of
// Silent Earth: 3. Tony's script, voiced with his HeyGen clone
// (build_voice.py -> build_audio.py -> VOICE_PROGRAM.wav). Song clips from
// Tony's own track samples sit in gaps in the voice (MUSIC_PROGRAM.wav, placed
// from audio-plan.json "clips"); each gets the track list with that song lit.
//
// Real imagery on every line: ComicVine covers, album art, the comic's own
// character designs (Coheed and Cambria Wiki, as in Ep 005), Wikimedia
// Commons photos (credited on screen), live ComixCatalog pages. No interior
// pages exist online for this series, so covers carry the comic.
//
// Spoiler line (RESEARCH.md): nothing past the first four issues. Covers #1
// to #5 can be big; #6 ("Wilhelm Ryan surrenders!") and #7 to #12 only in
// grids and fans.

import words from "./narration.words.js";
import plan from "./audio-plan.json" with { type: "json" };
import SIZES from "./sizes.js";
import { STING_PAGES } from "./sting.js";
import { resolveAnchors } from "../shared/anchors.js";

const LEAD = 0.12;
export const narrationWords = words.words;

const pad = (n) => String(n).padStart(2, "0");
const K = (n) => `covers/iksse-${pad(n)}.jpg`;
const V1 = (n) => `covers/iksse-01-v${pad(n)}.jpg`; // #1 variants: v01 is the convention exclusive (500)
const NYCC5 = "covers/iksse-05-v.jpg";
const C2E2_9 = "covers/iksse-09-v.jpg";
const ULT = "covers/iksse-ultimate.jpg";
const ALL = Array.from({ length: 12 }, (_, i) => K(i + 1));
const EARLY = [K(1), K(2), K(3), K(4)];
// Fans stack the last item on top: keep the later (spoilery) covers underneath.
const FAN = [K(12), K(10), K(8), K(6), K(9), K(7), K(5), K(3), K(2), K(4), K(1)];

const ALB = {
  iks: "albums/2003-in-keeping-secrets-of-silent-earth-3.jpg",
  sstb: "albums/2002-the-second-stage-turbine-blade.jpg",
  ga: "albums/2005-good-apollo-vol-1.jpg",
};
// Tony 2026-11-21: no repeated live photos, and nothing Parts 1 and 2 (Ep 004,
// 005) already used: no Summer Breeze, Bogotá, 2009, C2E2 or first NYCC photo,
// no Purdue campus 2012. Every photo here is new to the series.
const PH = {
  nyc2005: ["coheed-nyc", "Coheed and Cambria, Central Park, New York, 2005", "Photo: sethw (merged by Jackrm), CC BY-SA 2.0"],
  park2010: ["coheed-central-park", "Coheed and Cambria, Central Park, 2010", "Photo: Brian Reisinger, free use"],
  warped: ["coheed-warped-2007", "Michael Todd, Warped Tour 2007", "Photo: Rambis, public domain"],
  claudio2006: ["claudio-sanchez", "Claudio Sanchez, 2006", "Photo: Jubella, public domain"],
  claudioNycc: ["claudio-nycc-2010-b", "Claudio Sanchez, New York Comic Con 2010", "Photo: Nightscream, CC BY 3.0"],
  claudioPD: ["claudio-peter-david-nycc-2010", "Claudio Sanchez and Peter David signing, New York Comic Con 2010", "Photo: Nightscream, CC BY 3.0"],
  riviera: ["riviera-theatre", "Riviera Theatre, Chicago", "Photo: Goldnpuppy, CC BY-SA 4.0"],
  riviera2: ["riviera-2020", "Riviera Theatre, Chicago", "Photo: Paul R. Burley, CC BY-SA 4.0"],
  bell: ["purdue-bell-tower", "Purdue Bell Tower, West Lafayette", "Photo: A Hazy, CC BY-SA 4.0"],
  pillars: ["purdue-pillars", "Purdue's old gateway pillars", "Photo: Guilherme Garbino, CC0"],
  chauncey: ["chauncey-village-2011", "Chauncey Village, West Lafayette", "Photo: Qsthomson, CC BY-SA 3.0"],
  postcard: ["purdue-postcard", "Purdue University postcard, 1953", "Image: Steve Shook, CC BY 2.0"],
};
// IKSSE:3 packaging and tour art (Coheed and Cambria Wiki).
const lore = (k, title, sub, extra = {}) => panel(`lore/${k}.jpg`, { ...(title ? { title } : {}), ...(sub ? { sub } : {}), ...extra });
const WB = { "wb-coheed-site-oct-2003": "web.archive.org · coheedandcambria.com, October 24, 2003", "wb-yahoo-launch-videos-2004": "web.archive.org · launch.yahoo.com/musicvideos, June 2004" };
const wb = (asset, x, y, z, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment: "push", url: WB[asset], focus: { x, y }, zoom: z, centerFocus: true, ...cut, ...extra });

const cut = { transitionIn: "cut" };
const size = (asset) => SIZES[asset] ?? [1000, 1500];
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...cut, ...extra });
const pull = (asset, extra = {}) => cover(asset, { treatment: "slowPull", ...extra });
const cap = (asset, title, sub, kicker, extra = {}) => cover(asset, { title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), ...extra });
// zoomTo: starts on the band at focus.y, so the target is in frame from the first frame.
const zoom = (asset, x, y, z, extra = {}) => cover(asset, { treatment: "zoomTo", focus: { x, y, zoom: z }, ...extra });
const grid = (assets, extra = {}) => ({ type: "grid", assets, columns: Math.min(assets.length, 6), ...cut, ...extra });
const fan = (assets, extra = {}) => ({ type: "fan", assets, ...cut, ...extra });
const pair = (a, la, b, lb, extra = {}) => ({ type: "pair", assets: [{ asset: a, label: la }, { asset: b, label: lb }], ...cut, ...extra });
const panel = (asset, extra = {}) => ({ type: "panel", asset, size: size(asset), treatment: "slowPush", maxUpscale: 2.2, ...cut, ...extra });
const album = (k, extra = {}) => panel(ALB[k], extra);
const capAlbum = (title, sub, kicker, k = "iks", extra = {}) => album(k, { title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), ...extra });
const photo = (k, extra = {}) => panel(`photos/${PH[k][0]}.jpg`, { title: PH[k][1], sub: PH[k][2], ...extra });
const art = (k, title, sub, extra = {}) => {
  const ext = ["ambellina", "chase", "sizer", "claudio-good-apollo"].includes(k) ? "jpg" : "png";
  return panel(`characters/${k}.${ext}`, { ...(title ? { title } : {}), ...(sub ? { sub } : {}), ...extra });
};
const duo = (a, la, b, lb, extra = {}) => {
  const asset = (k) => `characters/${k}.${["ambellina", "chase", "sizer", "claudio-good-apollo"].includes(k) ? "jpg" : "png"}`;
  const aspect = (k) => size(asset(k))[0] / size(asset(k))[1];
  return { type: "pair", assets: [{ asset: asset(a), aspect: aspect(a), label: la }, { asset: asset(b), aspect: aspect(b), label: lb }], ...cut, ...extra };
};
const site = (asset, x, y, z, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment: "push", focus: { x, y }, zoom: z, centerFocus: true, ...cut, ...extra });

// The record's track list. "21:13" is track 23, after eleven silent tracks.
const TRACKS = [
  { title: "The Ring in Return", length: "2:07" },
  { title: "In Keeping Secrets of Silent Earth: 3", length: "8:15" },
  { title: "Cuts Marked in the March of Men", length: "5:05" },
  { title: "Three Evils", length: "5:10" },
  { title: "The Crowing", length: "6:40" },
  { title: "Blood Red Summer", length: "4:05" },
  { title: "The Camper Velourium I", length: "5:21" },
  { title: "The Camper Velourium II", length: "5:23" },
  { title: "The Camper Velourium III", length: "4:15" },
  { title: "A Favor House Atlantic", length: "3:55" },
  { title: "The Light & the Glass", length: "9:40" },
  { title: "A Lot of Nothing I to XI", n: null, length: "" },
  { title: "21:13", n: 23, length: "9:50" },
];
const SONG_TRACK = { ring: 1, title_open: 2, title_mid: 2, cuts: 3, evils: 4, crowing: 5, brs: 6, camper1: 7, camper2: 8, camper3: 9, afha: 10, light: 11, "2113": 23 };
const tracklist = (current, extra = {}) => ({ type: "tracklist", asset: ALB.iks, kicker: "In Keeping Secrets of Silent Earth: 3 · 2003", tracks: TRACKS, current, ...cut, ...extra });

// [anchor phrase, segment]
// A lyric on screen next to the comic art it matches (v3: lyrics vs. the comic).
const lyric = (text, song, asset) => ({ type: "quote", text, attribution: song, asset, ...cut });
const CH_ = (k) => `characters/${k}.${["ambellina", "chase", "sizer", "claudio-good-apollo"].includes(k) ? "jpg" : "png"}`;

const CUES = [
  // ── 01 Cold open ──────────────────────────────────────────────────────────
  ["What happens when your favorite rock album", album("iks", { transitionIn: "fade", fadeIn: 12 })],
  ["comes with twelve issues of homework", grid(ALL, { columns: 6 })],
  ["Well, I've read them all", fan(FAN)],
  ["Welcome back to The Amory Wars", lore("amory-wars-logo", "Part 3", "In Keeping Secrets of Silent Earth: 3")],

  // ── 02 Back in West Lafayette ─────────────────────────────────────────────
  ["In October of two thousand three", wb("wb-coheed-site-oct-2003", 0.42, 0.24, 2.0)],
  ["I was a sophomore at Purdue", photo("postcard")],
  ["Coheed and Cambria had just put out their second album", album("iks")],
  ["I'd walk to class as the sun came up", photo("bell")],
  ["listening to the opening of the title track", photo("pillars")],
  ["This album takes me right back there", photo("chauncey")],
  ["The Second Stage Turbine Blade was how I found the band", album("sstb")],
  ["This is the record that made me a fan for life", photo("nyc2005")],
  ["But today isn't about how it sounds", album("iks", { treatment: "slowPull" })],
  ["Every song on this album is a piece of a story", lore("iksse-back", undefined, undefined, { treatment: "zoomTo", focus: { x: 0.3, y: 0.42, zoom: 1.8 } })],
  ["and years later that story became a twelve-issue comic", grid(ALL, { columns: 6 })],
  ["So we're going to put the lyrics next to the comic", pair(ALB.iks, "The album · 2003", K(1), "The comic · 2010")],

  // ── 03 The family and the ghost ───────────────────────────────────────────
  ["Last time, I left you hanging", album("sstb", { treatment: "slowPull" })],
  ["The story picks up ten years after", cover(K(1))],
  ["the comic tells us Coheed killed Josephine and the twins", art("coheed", undefined, undefined, { treatment: "slowPull" })],
  ["Rough way to start a story", art("space")],
  ["Claudio, the son who got away", art("claudio", "Claudio Kilgannon")],
  ["has spent those ten years hiding on Shylos Ten", zoom(K(1), 0.5, 0.5, 1.35)],
  ["He's bearded, broke, and living underground", zoom(K(1), 0.46, 0.24, 2.2)],
  ["And he's haunted by the ghost of his father", duo("claudio-good-apollo", "Claudio", "v-coheed", "His father, Coheed")],
  ["They argue a lot", zoom(V1(3), 0.5, 0.36, 1.7)],
  ["Claudio blames him for wrecking the family", art("v-coheed", undefined, undefined, { treatment: "slowPull" })],

  // ── 04 Hello Apollo ───────────────────────────────────────────────────────
  ["The album opens with a short track called", tracklist(1)],
  ["The first words on it are", album("iks")],
  ["Issue one opens the same way", cover(K(1), { treatment: "slowPull" })],
  ["Claudio is outside Newo Ikkin's house", art("v-newo", "Newo Ikkin")],
  ["Newo was his girlfriend before everything fell apart", duo("claudio", "Claudio", "newo", "Newo")],
  ["He keeps calling her and hanging up", art("claudio-good-apollo", undefined, undefined, { treatment: "slowPull" })],
  ["Then her old dog, Apollo, wanders over", art("apollo-panel", "Apollo")],
  ["The comic is Claudio talking to a dog", pair(ALB.iks, "The album", K(1), "The comic")],
  ["Then the title track kicks in", tracklist(2)],
  ["There's a line about", lyric("“The one they call the Vision that bears the gift”", "“In Keeping Secrets of Silent Earth: 3”", K(5))],
  ["In the comic, that's Chase", art("chase", "Chase")],
  ["And there's a line asking", lyric("“Will, do the children really understand the things you did to them?”", "“In Keeping Secrets of Silent Earth: 3”", K(6))],
  ["Will is Wilhelm Ryan, the Supreme Tri-Mage", art("ryan", "Wilhelm Ryan", "The Supreme Tri-Mage")],
  ["The guy running the whole galaxy", art("heavens-fence-map", "Heaven's Fence")],

  // ── 05 The war outside ────────────────────────────────────────────────────
  ["While Claudio hides, there's a real war going on", zoom(K(3), 0.45, 0.45, 1.5)],
  ["Jesse, Claudio's uncle, better known as Inferno", art("v-inferno", "Jesse", "Inferno, Claudio's uncle")],
  ["is fighting Ryan's Red Army from his ship", zoom(K(3), 0.62, 0.72, 1.7)],
  ["And in his lab, he's building I-Robots", duo("chase", "Chase", "sizer", "Sizer")],
  ["Inferno held back her growth on purpose", zoom(K(5), 0.42, 0.74, 2.0)],
  ["All she wants is for Inferno to admit he's her father", duo("chase", "Chase", "inferno", "Inferno")],
  ["Now listen to", tracklist(3)],
  ["The chorus says it outright", lyric("“Chase, it's you I want”", "“Cuts Marked in the March of Men”", K(5))],
  ["Somebody's singing to her by name", cover(K(5))],
  ["On the album, that's a mystery", album("iks", { treatment: "slowPull" })],
  ["In the comic, she's right there on the battlefield", zoom(K(9), 0.5, 0.55, 1.3)],

  // ── 06 The Crowing ────────────────────────────────────────────────────────
  ["might have been my favorite song when I first got the album", wb("wb-coheed-site-oct-2003", 0.48, 0.79, 2.9)],
  ["The Crowing is also Claudio's role in the story", art("claudio-good-apollo", "The Crowing", "Claudio's role in the story")],
  ["The prophecy says he's the one who'll destroy the Keywork", art("keywork-diagram", "The Keywork")],
  ["He wants nothing to do with it", zoom(K(4), 0.5, 0.3, 1.9)],
  ["So the Prise, a group of angel-like beings", cover(K(8))],
  ["Her name is Ambellina", art("ambellina", "Ambellina", "A Prise")],
  ["Her sisters burned her wings and cast her out", art("ambellina", undefined, undefined, { treatment: "slowPull" })],
  ["Here's the line from the song", lyric("“Dear Ambellina, the Prise wishes you, to watch over me”", "“The Crowing”", CH_("ambellina"))],
  ["That's the plot of the comic, in one line", duo("claudio", "Claudio", "ambellina", "Ambellina")],
  ["The same song has Claudio saying he", lyric("“I severed my ties to shroud this body under the streets of this city”", "“The Crowing”", K(1))],
  ["That's exactly where we find him in issue one", pull(K(1))],
  ["It even names her", lyric("“The Newo that I loved”", "“The Crowing”", CH_("v-newo"))],

  // ── 07 Pieces and family ──────────────────────────────────────────────────
  ["has one of the clearest matches on the album", tracklist(4)],
  ["The lyric goes", lyric("“Picture a young boy in pieces”", "“Three Evils (Embodied in Love and Shadow)”", K(5))],
  ["and later", lyric("“We'll fix him, restore him”", "“Three Evils (Embodied in Love and Shadow)”", K(9))],
  ["In the comic, Mayo Deftinwolf's soldiers tear an I-Robot", art("mayo", "General Mayo Deftinwolf")],
  ["named Sizer apart", art("sizer", "Sizer", "An I-Robot")],
  ["Sizer is huge, but he's basically a kid", zoom(K(5), 0.5, 0.35, 1.4)],
  ["Claudio makes a living picking through dead Red Army prisoners", zoom(K(10), 0.5, 0.72, 1.5)],
  ["So he rebuilds him", duo("claudio", "Claudio", "sizer", "Sizer")],
  ["When Claudio tells Sizer he's proud of him", zoom(K(9), 0.42, 0.6, 1.5)],
  ["That was one of the singles", tracklist(6)],
  ["In the middle of it there's this line", lyric("“Even number your nephew”", "“Blood Red Summer”", CH_("inferno"))],
  ["Claudio is Inferno's nephew", duo("inferno", "Jesse, the uncle", "claudio", "Claudio, the nephew")],
  ["When they finally meet on the battlefield", zoom(K(11), 0.5, 0.5, 1.3)],
  ["Family reunions in The Amory Wars", cover(K(11), { treatment: "slowPull" })],

  // ── 08 Faint of Hearts ────────────────────────────────────────────────────
  ["Now my favorite stretch of the album", tracklist(7)],
  ["The Camper Velourium is a ship", art("space", "The Camper Velourium", "A ship in the comic")],
  ["It belongs to a freighter pilot named Al the Killer", cover(K(7))],
  ["In the comic, The Faint of Hearts is a bar", cover(K(4))],
  ["Claudio is in there cheating at cards", zoom(K(4), 0.24, 0.6, 1.9)],
  ["Al wins the hand, goes home", zoom(K(4), 0.5, 0.3, 2.0)],
  ["The lyrics on this one are from Al's side", tracklist(7)],
  ["The last line is", lyric("“Tonight sleep tight my gun”", "“The Camper Velourium I: Faint of Hearts”", K(7))],
  ["Once you know who Al is", pull(K(7))],

  // ── 09 Backend of Forever ─────────────────────────────────────────────────
  ["Part two is", tracklist(8)],
  ["It's almost my favorite Coheed song, period", photo("park2010")],
  ["And it turns out it's a breakup song", album("iks")],
  ["In issue one, there's a scene with Al and a woman named Luci", cover(K(1))],
  ["He jumps out of her closet", zoom(K(7), 0.35, 0.3, 1.6)],
  ["a starship called the Connecticut", zoom(K(3), 0.5, 0.4, 1.5)],
  ["Now here's the lyric", lyric("“Over and out, Connecticut”", "“The Camper Velourium II: Backend of Forever”", K(3))],
  ["The chorus says", lyric("“This isn't love”", "“The Camper Velourium II: Backend of Forever”", K(7))],
  ["Which is the most self-aware thing Al ever says", pull(K(7))],

  // ── 10 Al the Killer ──────────────────────────────────────────────────────
  ["Part three is", tracklist(9)],
  ["After Luci left, Al started killing women", lore("iksse-booklet", undefined, undefined, { treatment: "slowPull" })],
  ["The song has a line about the dead", lyric("“Beneath the surface sealed by the floors boarded up”", "“The Camper Velourium III: Al the Killer”", K(8))],
  ["In the comic, Claudio, Ambellina and Sizer finally get off the planet", grid([K(7), K(8), K(9)])],
  ["Ambellina finds a sealed room full of bodies", art("ambellina", undefined, undefined, { treatment: "slowPush" })],
  ["Al knocks her out, and Claudio catches him", zoom(K(9), 0.4, 0.62, 1.6)],
  ["They fight across the ship until it crashes", zoom(K(3), 0.65, 0.72, 1.7)],
  ["Al gets one more shot in and stabs Claudio", cover(K(10))],
  ["Claudio uses his powers to drive him rabid", zoom(V1(3), 0.62, 0.55, 1.6)],
  ["That's the end of Al", pull(K(7))],

  // ── 11 House Atlantic ─────────────────────────────────────────────────────
  ["Next up", tracklist(10)],
  ["House Atlantic is Wilhelm Ryan's stronghold", art("ryan-throne", "Wilhelm Ryan")],
  ["It's where Inferno's war ends up", zoom(K(11), 0.5, 0.45, 1.3)],
  ["Inferno and the Prise have actually captured Ryan", zoom(K(6), 0.5, 0.32, 1.6)],
  ["Jesse executes him", art("inferno")],
  ["Then Mayo brings him back to life", art("mayo", undefined, undefined, { treatment: "slowPull" })],
  ["So it's war again, on Ryan's home turf", grid([K(9), K(10), K(11), K(12)])],
  ["Claudio shows up, gets backed by Chase", duo("claudio-good-apollo", "Claudio", "chase", "Chase")],
  ["and fights Vielar Crom in his giant metal body", art("crom-panel", "Vielar Crom")],
  ["Claudio puts out a blast so big it cripples House Atlantic", cover(K(12))],
  ["and they escape on the Grail Arbor", zoom(K(3), 0.45, 0.45, 1.5)],
  ["And the song?", lyric("“Run quick, they're behind us”", "“A Favor House Atlantic”", K(12))],

  // ── 12 The Light & the Glass ──────────────────────────────────────────────
  ["closes the album", tracklist(11)],
  ["It has a line that hits harder after the comic", lyric("“Your father's dead, he passed in his sleep”", "“The Light & the Glass”", CH_("v-coheed"))],
  ["Claudio's father is already dead in this story", art("coheed")],
  ["He's the ghost who's been arguing with him the whole time", duo("claudio", "Claudio", "v-coheed", "Coheed")],
  ["And it brings us back to the dog", art("apollo-panel", undefined, undefined, { treatment: "slowPull" })],
  ["When Claudio finishes telling Apollo everything", pull(K(1))],
  ["Apollo tries to follow him", art("newo", "Newo")],
  ["His last line in the comic is", lyric("“Good Apollo, I'm Burning Star IV”", "Claudio, the comic's last line", K(12))],
  ["Now flip open the album booklet", lore("iksse-booklet")],
  ["there's one extra line that isn't sung", lyric("“My dearest Apollo, I'll be Burning Star IV”", "The album booklet", ALB.iks)],
  ["The album and the comic end on the same idea", pair(ALB.iks, "The album", K(12), "The comic")],
  ["And it's the title of the next record", capAlbum("Good Apollo, I'm Burning Star IV", "2005", undefined, "ga")],

  // ── 13 The hidden song ────────────────────────────────────────────────────
  ["The album has one more trick", lore("iksse-cd")],
  ["If you owned the CD", lore("iksse-back", undefined, undefined, { treatment: "zoomTo", focus: { x: 0.3, y: 0.62, zoom: 2.0 } })],
  ["Then, on track twenty-three", tracklist(23)],
  ["I loved finding stuff like that", tracklist(12)],
  ["The vinyl has it", album("iks", { treatment: "slowPull" })],
  ["It ends by bringing back a line from the first record", pair(ALB.sstb, "2002", ALB.iks, "2003")],
  ["will never die", lyric("“IRO-bot will never die”", "“21:13” · and “IRO-Bot” on the first album", ALB.sstb)],
  ["That's the end of The Second Stage Turbine Blade", album("sstb", { treatment: "slowPull" })],

  // ── 14 From album to comic ────────────────────────────────────────────────
  ["The comic came out from BOOM! Studios with Evil Ink", lore("amory-wars-logo", "BOOM! Studios with Evil Ink")],
  ["twelve issues from May", grid(ALL, { columns: 6, title: "The Amory Wars: In Keeping Secrets of Silent Earth: 3", sub: "May 2010 to June 2011" })],
  ["Claudio Sanchez wrote it with Peter David", photo("claudioPD")],
  ["Chris Burnham drew the early issues", cap(K(2), "Chris Burnham", "Art on the early issues")],
  ["and Kyle Strahm and Aaron Kuder came in later", grid([K(1), K(6), K(8), K(12)], { title: "Kyle Strahm on #6 · Aaron Kuder from #8" })],
  ["I bought every issue as it came out", fan(FAN)],
  ["I thought they felt a little low-rent", zoom(K(2), 0.5, 0.45, 1.4)],
  ["Not a glowing review", photo("claudioNycc")],
  ["Now the collector stuff", cover(V1(1))],
  ["Issue one had a convention-exclusive cover", cap(V1(1), "#1 · Convention exclusive", "Limited to 500", undefined, { captionAlign: "right" })],
  ["Issue five had a New York Comic Con cover", cap(NYCC5, "#5 · New York Comic Con 2010", undefined, undefined, { captionAlign: "right" })],
  ["And issue nine had a", cap(C2E2_9, "#9 · C2E2 exclusive", "Limited to 300", undefined, { captionAlign: "right" })],
  ["C2E2 is Chicago's con", zoom(C2E2_9, 0.5, 0.45, 1.5)],
  ["I don't own either of the numbered ones", pair(V1(1), "#1 · Limited to 500", C2E2_9, "#9 · Limited to 300")],
  ["It's also collected in three trade paperbacks", site("cc-work-iksse-tpb", 0.5, 0.45, 1.25)],
  ["Or there's the Ultimate Edition", cap(ULT, "Ultimate Edition", "2012")],

  // ── 15 Outro ──────────────────────────────────────────────────────────────
  ["Coheed played this whole album live", lore("neverender-2008-box", "Neverender · 2008", "Four albums in full, one each night")],
  ["night two at the Riviera here in Chicago", photo("riviera")],
  ["and toured it again in two thousand fourteen", lore("poster-neverender-iksse-2014", "Neverender · 2014", "The whole album, every night")],
  ["I didn't make it to either", photo("riviera2")],
  ["If you're collecting the series", site("cc-series-iksse", 0.5, 0.35, 1.25)],
  ["with a printable checklist", site("cc-series-iksse", 0.28, 0.87, 2.2)],
  ["Add issues I own", site("cc-series-iksse", 0.45, 0.56, 2.0)],
  ["and an editions tab", site("cc-work-iksse-tpb", 0.3, 0.56, 2.0)],
  ["Next time, we pick up right where Claudio left off", capAlbum("Next: Good Apollo", undefined, undefined, "ga")],
  ["Subscribe so you don't miss it", fan(FAN)],
  ["And tell me which song", tracklist(0)],
  ["Mine might just be", tracklist(8)],
  ["Thanks for watching", album("iks", { treatment: "slowPull" })],
];
// Song clips get the track list, except the Apollo line, which gets the lyric card.
const CLIP_SHOT = { ring: () => lyric("“Hello Apollo, where should I begin?”", "“The Ring in Return”", K(1)) };

const anchors = CUES.map((c) => c[0]);
const resolved = resolveAnchors(narrationWords, anchors);
export const anchorMisses = resolved.misses.map((m) => ({ ...m, phrase: anchors[m.index] }));
if (anchorMisses.length) throw new Error(`episode-009: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);

const segments = CUES.map(([anchor, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - LEAD).toFixed(3), beat: anchor }));
segments[0].at = 0;
// Song clips: the voice is silent, so these come from the audio plan. The
// track list lights the song that's playing.
for (const c of plan.clips) {
  segments.push({ ...(CLIP_SHOT[c.song] ? CLIP_SHOT[c.song]() : tracklist(SONG_TRACK[c.song])), at: c.at - 0.15, beat: `Clip: ${c.title}` });
}
segments.push({ type: "pageFlipSting", at: plan.sting.at, beat: "Channel sting", transitionOut: "cut", fadeIn: 6, pages: STING_PAGES });
segments.push({ type: "end", at: plan.endCard, dur: plan.duration - plan.endCard, beat: "End card", title: "Next: Good Apollo", sub: "Which song from In Keeping Secrets stuck with you?", transitionIn: "cut" });
segments.sort((x, y) => x.at - y.at);

export default {
  id: "episode-009", assetEpisodeId: "episode-009", outputDir: "episode-009", outputName: "episode-009", compositionId: "Episode009",
  title: "In Keeping Secrets of Silent Earth: 3", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/VOICE_PROGRAM.wav", at: 0, volume: 1 },
    // Pre-built by build_audio.py: the Double Drift bed at Ep 008's level, ducked under the sting and the song clips, plus the clips.
    music: { asset: "audio/MUSIC_PROGRAM.wav", volume: 1, fadeIn: 0, fadeOut: 0, loop: false },
    sting: { asset: "audio/STING_PAGEFLIP.wav", at: plan.sting.at, from: 0, dur: 5.6, volume: 1, fadeIn: 0, fadeOut: 0.3 },
  },
};
