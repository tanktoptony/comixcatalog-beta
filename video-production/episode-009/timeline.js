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
const CUES = [
  // ── 01 Cold open ──────────────────────────────────────────────────────────
  ["What happens when your favorite rock album", album("iks", { transitionIn: "fade", fadeIn: 12 })],
  ["comes with twelve issues of homework", grid(ALL, { columns: 6 })],
  ["Well, I've read them all", fan(FAN)],
  ["Welcome back to The Amory Wars", lore("amory-wars-logo", "Part 3", "In Keeping Secrets of Silent Earth: 3")],

  // ── 02 Back in West Lafayette ─────────────────────────────────────────────
  ["In October of two thousand three", wb("wb-coheed-site-oct-2003", 0.42, 0.24, 2.0)],
  ["I was a sophomore at Purdue University", photo("postcard")],
  ["Coheed and Cambria had just released their second album", album("iks")],
  ["I'm pretty sure I downloaded it first", wb("wb-coheed-site-oct-2003", 0.47, 0.79, 2.6)],
  ["so I'm sure I bought a copy", lore("iksse-cd")],
  ["What I remember most clearly, though", photo("bell")],
  ["I was living in an off-campus apartment", photo("chauncey")],
  ["I'd walk to class as the sun came up", photo("pillars")],
  ["listening to those opening notes of the title track", tracklist(2)],
  ["I can still picture it", lore("iksse-booklet")],
  ["This album takes me right back there", album("iks", { treatment: "slowPull" })],
  ["We covered The Second Stage Turbine Blade in Part 2", album("sstb")],
  ["But I might like this one more", pair(ALB.sstb, "2002", ALB.iks, "2003")],
  ["This is the record that made me a Coheed fan for life", photo("nyc2005")],
  ["I've seen them a couple dozen times since", photo("park2010")],
  ["And since we spent an entire episode introducing", duo("v-coheed", "Coheed", "v-cambria", "Cambria")],
  ["we should probably discuss what happened next", cover(V1(3))],
  ["Because I deliberately left you hanging", album("sstb", { treatment: "slowPull" })],

  // ── 03 The family and the ghost ───────────────────────────────────────────
  ["The story picks up ten years after", cover(K(1))],
  ["Claudio Kilgannon emerges from Shylos Ten", zoom(K(1), 0.46, 0.24, 2.0, { title: "Claudio Kilgannon", sub: "Out of Shylos Ten, the Red Army's prison planet" })],
  ["His family is gone", art("claudio-good-apollo")],
  ["And the opening of this chapter finally confronts", art("space")],
  ["In the comic, we learn that Coheed killed", art("coheed", undefined, undefined, { treatment: "slowPull" })],
  ["Rough way to start a story", pull(K(1))],
  ["And Claudio isn't exactly getting a clean start", art("claudio")],
  ["He's haunted by the ghost of his father", duo("claudio-good-apollo", "Claudio", "v-coheed", "His father, Coheed")],
  ["They argue", zoom(V1(3), 0.5, 0.36, 1.7)],
  ["Not great when you've already got a murdered family", zoom(K(5), 0.5, 0.35, 1.35)],
  ["Claudio has powers he hasn't used in ten years", zoom(V1(3), 0.62, 0.55, 1.6)],
  ["and Wilhelm Ryan and General Mayo Deftinwolf know he's alive", duo("ryan", "Wilhelm Ryan", "mayo", "Mayo Deftinwolf")],
  ["In the first issue, Claudio uses those powers again", site("cc-issue-iksse-01", 0.3, 0.45, 1.5)],
  ["A little girl calls him an angel", zoom(K(1), 0.5, 0.55, 1.4)],
  ["That tells you where his head is at", zoom(K(1), 0.46, 0.23, 2.5)],

  // ── 04 Hello Apollo ───────────────────────────────────────────────────────
  ["Here's my favorite link between the album and the comic", pair(ALB.iks, "The album · 2003", K(1), "The comic · 2010")],
  ["The album begins with a short track called", lore("iksse-back", undefined, undefined, { treatment: "zoomTo", focus: { x: 0.25, y: 0.3, zoom: 2.0 } })],
  ["And the first words we hear are", album("iks")],
  ["That isn't just a weird intro", lore("keywork-iksse")],
  ["The comic opens the same way", cover(K(1), { treatment: "slowPull" })],
  ["with Claudio telling the story to Apollo", art("apollo-panel", "Apollo")],
  ["outside Newo Ikkin's house", art("v-newo", "Newo Ikkin")],
  ["Read the comic and you recognize the moment", zoom(K(1), 0.5, 0.42, 1.3)],
  ["Go back to the album", lore("iksse-cd", undefined, undefined, { treatment: "slowPull" })],
  ["If you pay way too much attention to album details", lore("iksse-back", undefined, undefined, { treatment: "slowPull" })],
  ["The title track follows", tracklist(2)],
  ["It was a big part of my college soundtrack", photo("postcard", { treatment: "slowPull" })],
  ["Now I hear it next to the start of Claudio's story", zoom(K(4), 0.5, 0.3, 1.9)],
  ["The album sets the mood", lore("iksse-booklet", undefined, undefined, { treatment: "slowPull" })],
  ["The comic tells you who everyone is", art("heavens-fence-map", "Heaven's Fence")],

  // ── 05 The war outside ────────────────────────────────────────────────────
  ["The story is bigger than Claudio's family", grid([K(2), K(3), K(4), K(5)])],
  ["Wilhelm Ryan is still the Supreme Tri-Mage", art("ryan-throne", "Wilhelm Ryan", "The Supreme Tri-Mage")],
  ["Mayo Deftinwolf is still involved", art("mayo", "General Mayo Deftinwolf", undefined, { treatment: "slowPull" })],
  ["and the Red Army is still a problem", zoom(K(5), 0.5, 0.62, 1.6)],
  ["Meanwhile, Jesse, also known as Inferno", art("v-inferno", "Jesse", "Inferno")],
  ["fighting his own war from a ship called the Grail Arbor", zoom(K(3), 0.45, 0.45, 1.5)],
  ["If you remember the", art("kbi-lineup", "The K.B.I.", "From Part 2")],
  ["And if you've forgotten", album("sstb")],
  ["That's where", tracklist(3)],
  ["This stretch of the album is war and revenge", zoom(K(3), 0.65, 0.72, 1.7)],
  ["The comic shows you the war", zoom(K(2), 0.5, 0.42, 1.5)],
  ["The lyrics don't always spell it out", lore("iksse-back", undefined, undefined, { treatment: "zoomTo", focus: { x: 0.3, y: 0.38, zoom: 2.2 } })],
  ["I'm not going to pretend I know what every lyric means", cover(V1(2))],
  ["I'll stick to the connections we can actually back up", art("keywork-diagram", "The Keywork")],

  // ── 06 The Crowing ────────────────────────────────────────────────────────
  ["might have been my favorite song when I first got the album", wb("wb-coheed-site-oct-2003", 0.48, 0.79, 2.9)],
  ["It's still the song I tie most to this era", photo("claudio2006")],
  ["It's long, it keeps building", tracklist(5)],
  ["The important story connection is right there in the title", art("claudio-good-apollo", "The Crowing", "Claudio's role in the story", { treatment: "slowPull" })],
  ["He's discovering powers he hasn't used for a decade", zoom(V1(3), 0.62, 0.55, 1.6, { treatment: "zoomTo" })],
  ["Ryan and Mayo want him stopped", art("ryan")],
  ["So while he's still figuring out his own life", cover(K(4))],
  ["That's what makes Claudio worth following", zoom(K(4), 0.5, 0.3, 2.1)],
  ["He's lost almost everything", pull(K(1))],
  ["Now he has to figure out these powers", pull(V1(3))],
  ["never mind a guy whose dead dad is following him around", art("v-coheed", undefined, undefined, { treatment: "slowPull" })],

  // ── 07 Blood Red Summer ───────────────────────────────────────────────────
  ["Then we get", tracklist(6)],
  ["were the songs a lot of people heard first", photo("warped")],
  ["was released as a single in June", lore("iksse-cd", "The singles", "“A Favor House Atlantic”, June 2004 · “Blood Red Summer”, November 2004")],
  ["I didn't care much about the singles", photo("park2010", { treatment: "slowPull" })],
  ["Reading the comics changes how I hear these songs", pair(K(3), "#3", K(4), "#4")],
  ["I knew them by the melody", album("iks", { treatment: "zoomTo", focus: { x: 0.3, y: 0.32, zoom: 2.2 } })],
  ["Now there's an actual story next to them", grid(EARLY)],
  ["Sometimes I find out what I thought a song was about", photo("claudioNycc")],

  // ── 08 Ambellina and Sizer ────────────────────────────────────────────────
  ["Back to the comic", cover(K(2))],
  ["We're introduced to Ambellina", art("ambellina", "Ambellina", "A Prise, cast out by her own kind")],
  ["There's also Sizer", art("sizer", "Sizer", "A disassembled I-Robot")],
  ["Together, they're looking for Inferno", art("inferno")],
  ["Reasonable plan", zoom(K(3), 0.5, 0.3, 1.4)],
  ["Inferno has his own operation underway", art("v-inferno", undefined, undefined, { treatment: "slowPull" })],
  ["His laboratory is building two I-Robots", duo("chase", "Chase", "sizer", "Sizer")],
  ["Chase has the mind of a grown woman", art("chase", "Chase")],
  ["That's a lot", grid(ALL, { columns: 6 })],
  ["The comics fill in everything I missed walking to class", photo("pillars", { treatment: "slowPull" })],

  // ── 09 The Camper Velourium ───────────────────────────────────────────────
  ["Now we reach three consecutive songs", tracklist(7)],
  ["Faint of Hearts", lore("iksse-back", undefined, undefined, { treatment: "zoomTo", focus: { x: 0.33, y: 0.52, zoom: 2.2 } })],
  ["In the story, the Camper Velourium is a ship", art("space", "The Camper Velourium", "A ship in the story", { treatment: "slowPull" })],
  ["Al the Killer is a freighter pilot", tracklist(9)],
  ["Claudio and his crew run into trouble on that ship", duo("claudio", "Claudio", "ambellina", "Ambellina")],
  ["is almost my favorite Coheed song, period", tracklist(8)],
  ["After more than twenty years with this band", photo("nyc2005", { treatment: "slowPull" })],
  ["I never get tired of it", album("iks", { treatment: "zoomTo", focus: { x: 0.72, y: 0.66, zoom: 2.4 } })],
  ["And these three songs sit together on the record", tracklist(8)],
  ["Then comes", tracklist(9)],
  ["Knowing Al is an actual character", zoom(K(4), 0.25, 0.6, 1.7)],
  ["A pilot, a ship, a whole storyline", grid(EARLY)],
  ["I had no idea when I was first listening", photo("chauncey", { treatment: "slowPull" })],

  // ── 10 A Favor House Atlantic ─────────────────────────────────────────────
  ["After that", tracklist(10)],
  ["I probably loved this one right away", photo("claudio2006", { treatment: "slowPull" })],
  ["I missed a lot of music videos around this time", wb("wb-yahoo-launch-videos-2004", 0.5, 0.4, 1.1)],
  ["Yahoo was somewhere you could go watch them", wb("wb-yahoo-launch-videos-2004", 0.44, 0.24, 1.9)],
  ["It's short next to everything around it", tracklist(10)],
  ["After three Camper Velourium songs", lore("iksse-back", undefined, undefined, { treatment: "zoomTo", focus: { x: 0.35, y: 0.58, zoom: 2.2 } })],
  ["Makes sense it was a single", pull(V1(2))],

  // ── 11 The Light & the Glass ──────────────────────────────────────────────
  ["comes next, and it's nine minutes", tracklist(11)],
  ["Early Coheed records take their time", photo("warped", { treatment: "slowPull" })],
  ["A four-minute single sits right next to", tracklist(10)],
  ["That mix is why I listen to the whole album", album("iks", { treatment: "slowPull" })],
  ["By now we've met Claudio again", cover(V1(3))],
  ["found out about his family", duo("coheed", "Coheed", "cambria", "Cambria")],
  ["seen the fight between Ryan and Inferno", duo("ryan", "Wilhelm Ryan", "inferno", "Inferno")],
  ["and met a bunch of new characters", duo("ambellina", "Ambellina", "chase", "Chase")],
  ["The comics let you go back through all of it", grid([K(1), K(4), K(12)])],
  ["And they remind me how much story", lore("keywork-iksse", undefined, undefined, { treatment: "slowPull" })],

  // ── 12 The hidden song ────────────────────────────────────────────────────
  ["But the album still has one more trick", lore("iksse-cd")],
  ["If you owned the CD, you might remember", lore("iksse-back", undefined, undefined, { treatment: "zoomTo", focus: { x: 0.3, y: 0.62, zoom: 2.0 } })],
  ["Eleven silent tracks, in fact", tracklist(12)],
  ["And then, on track twenty-three", tracklist(23)],
  ["I loved that stuff", album("iks")],
  ["It felt like being let in on a secret", lore("keywork-iksse")],
  ["also brings back musical ideas from", pair(ALB.sstb, "The Second Stage Turbine Blade · 2002", ALB.iks, "In Keeping Secrets · 2003")],
  ["So even this little hidden discovery", art("keywork-diagram", undefined, undefined, { treatment: "slowPull" })],
  ["Some digital versions and reissues remove", tracklist(23)],
  ["That's a shame, because finding it that way", lore("iksse-cd", undefined, undefined, { treatment: "slowPull" })],
  ["The vinyl has it", album("iks", { treatment: "slowPull" })],

  // ── 13 From album to comic ────────────────────────────────────────────────
  ["The album came out in October", wb("wb-coheed-site-oct-2003", 0.5, 0.35, 1.2)],
  ["The twelve-issue comic series arrived years later", grid(ALL, { columns: 6, title: "The Amory Wars: In Keeping Secrets of Silent Earth: 3", sub: "May 2010 to June 2011" })],
  ["It was published by", lore("amory-wars-logo", "BOOM! Studios with Evil Ink")],
  ["written by Claudio Sanchez and Peter David", photo("claudioPD")],
  ["Chris Burnham handled early artwork", cap(K(2), "Chris Burnham", "Art on the early issues")],
  ["with other artists including", grid([K(1), K(6), K(8), K(12)], { title: "Kyle Strahm on #6 · Aaron Kuder from #8" })],
  ["I was buying the individual issues as they came out", fan(FAN)],
  ["I've still got the whole run", site("cc-series-iksse", 0.5, 0.95, 1.3)],
  ["Not a glowing review", zoom(K(2), 0.5, 0.45, 1.4)],
  ["I was already invested in the band and the story", site("cc-search-amory-wars", 0.5, 0.35, 1.2)],
  ["Now the collector stuff", cover(V1(1))],
  ["Issue one had a convention-exclusive cover", cap(V1(1), "#1 · Convention exclusive", "Limited to 500", undefined, { captionAlign: "right" })],
  ["Issue five had a New York Comic Con cover", cap(NYCC5, "#5 · New York Comic Con 2010", undefined, undefined, { captionAlign: "right" })],
  ["And issue nine had a", cap(C2E2_9, "#9 · C2E2 exclusive", "Limited to 300", undefined, { captionAlign: "right" })],
  ["C2E2 is Chicago's con", zoom(C2E2_9, 0.5, 0.45, 1.5)],
  ["I don't own either of the numbered exclusives", pair(V1(1), "#1 · Limited to 500", C2E2_9, "#9 · Limited to 300")],
  ["The series was also collected into three trade paperbacks", site("cc-work-iksse-tpb", 0.5, 0.45, 1.25)],
  ["and eventually hardcover editions and a Complete Collection", site("cc-work-iksse-tpb", 0.62, 0.9, 1.9)],
  ["Or there's the Ultimate Edition", cap(ULT, "Ultimate Edition", "2012")],
  ["Not bad for an album I listened to walking to class", photo("bell", { treatment: "slowPull" })],

  // ── 14 Neverender and the legacy ──────────────────────────────────────────
  ["Coheed likes to play these albums live", lore("neverender-2008-teaser")],
  ["the original Neverender concerts", lore("neverender-2008-box", "Neverender · 2008", "Four albums in full, one each night")],
  ["Chicago's shows were at the Riviera Theatre", photo("riviera")],
  ["on night two", photo("riviera2", { title: "In Keeping Secrets: night two" })],
  ["they toured this entire album again", lore("poster-neverender-iksse-2014", "Neverender · 2014", "The whole album, every night")],
  ["I didn't make it to either of those particular runs", lore("neverender-cotf")],
  ["My little brother and I did attend", album("sstb")],
  ["and I've caught Coheed plenty of other times", photo("claudioNycc", { treatment: "slowPull" })],
  ["These records are tied to different stages of my life", lore("poster-neverender-iksse-2014", undefined, undefined, { treatment: "slowPull" })],
  ["I've been following this band since I was a college kid", photo("chauncey")],
  ["There was even a", capAlbum("S.S. Neverender", "Raiders of Silent Earth: 3")],
  ["The album went Gold", lore("iksse-cd", "Certified Gold", "No. 52 on the Billboard 200")],
  ["All from something I first heard on a burned CD", lore("iksse-booklet")],

  // ── 15 Outro ──────────────────────────────────────────────────────────────
  ["That's In Keeping Secrets", album("iks")],
  ["I've got a lot of history with this record", photo("bell")],
  ["If you're collecting the series yourself", site("cc-series-iksse", 0.5, 0.35, 1.25)],
  ["along with a printable checklist", site("cc-series-iksse", 0.28, 0.87, 2.2)],
  ["Add issues I own", site("cc-series-iksse", 0.45, 0.56, 2.0)],
  ["and an editions tab", site("cc-work-iksse-tpb", 0.3, 0.56, 2.0)],
  ["Next time, we'll continue with Good Apollo", capAlbum("Next: Good Apollo", undefined, undefined, "ga")],
  ["If you're enjoying this series, subscribe", fan(FAN)],
  ["And let me know which song", tracklist(0)],
  ["Mine might just be", tracklist(8)],
  ["Thanks for watching", album("iks", { treatment: "slowPull" })],
];

const anchors = CUES.map((c) => c[0]);
const resolved = resolveAnchors(narrationWords, anchors);
export const anchorMisses = resolved.misses.map((m) => ({ ...m, phrase: anchors[m.index] }));
if (anchorMisses.length) throw new Error(`episode-009: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);

const segments = CUES.map(([anchor, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - LEAD).toFixed(3), beat: anchor }));
segments[0].at = 0;
// Song clips: the voice is silent, so these come from the audio plan. The
// track list lights the song that's playing.
for (const c of plan.clips) {
  segments.push({ ...tracklist(SONG_TRACK[c.song]), at: c.at - 0.15, beat: `Clip: ${c.title}` });
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
