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
const PH = {
  purdue: ["purdue-campus-2012", "Purdue University, West Lafayette", "Photo: Diego Delso, CC BY-SA 3.0"],
  live2009: ["coheed-live-2009", "Coheed and Cambria live, 2009", "Photo: HeavyMezza89, public domain"],
  bogota: ["coheed-live-bogota-2007", "Coheed and Cambria live, Bogotá, 2007", "Photo: Juan Andres Martinez, CC BY-SA 2.0"],
  sbA: ["coheed-live-summer-breeze-2016-a", "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  sbB: ["coheed-live-summer-breeze-2016-b", "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  sbC: ["coheed-live-summer-breeze-2016-c", "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  sbD: ["coheed-live-summer-breeze-2016-d", "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  c2e2: ["claudio-chondra-c2e2-2012", "Chondra Echert and Claudio Sanchez, C2E2 2012", "Photo: Pat Loika, CC BY 2.0"],
  nycc: ["claudio-sanchez-nycc-2010", "Claudio Sanchez, New York Comic Con 2010", "Photo: Nightscream, CC BY 3.0"],
};

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
  ["Welcome back to The Amory Wars", capAlbum("The Amory Wars · Part 3", "In Keeping Secrets of Silent Earth: 3")],

  // ── 02 Back in West Lafayette ─────────────────────────────────────────────
  ["In October of two thousand three", capAlbum("In Keeping Secrets of Silent Earth: 3", "October 7, 2003 · Equal Vision Records", "Coheed and Cambria's second album")],
  ["I was a sophomore at Purdue University", photo("purdue")],
  ["Coheed and Cambria had just released their second album", album("iks")],
  ["I'm pretty sure I downloaded it first", photo("live2009")],
  ["I was buying CDs back then, too", album("iks", { treatment: "slowPull" })],
  ["What I remember most clearly, though", photo("purdue", { treatment: "slowPull" })],
  ["I was living in an off-campus apartment", photo("purdue")],
  ["I'd walk to class as the sun came up", album("iks")],
  ["listening to those opening notes of the title track", tracklist(2)],
  ["I can still picture it", photo("sbA")],
  ["There are albums I remember liking", pair(ALB.sstb, "2002", ALB.iks, "2003")],
  ["Then there are albums that bring an entire period", album("iks", { treatment: "slowPull" })],
  ["We covered The Second Stage Turbine Blade in Part 2", album("sstb")],
  ["That album was my introduction to the band", photo("bogota")],
  ["But I might actually like this one more", album("iks")],
  ["This was the record that really cemented", photo("sbB")],
  ["I've seen them a couple dozen times since", photo("sbC")],
  ["And since we spent an entire episode introducing", duo("coheed", "Coheed", "cambria", "Cambria")],
  ["we should probably discuss what happened next", art("claudio", "Claudio Kilgannon")],
  ["Because I deliberately left you hanging", album("sstb", { treatment: "slowPull" })],

  // ── 03 The family and the ghost ───────────────────────────────────────────
  ["The story picks up ten years after", cover(K(1))],
  ["Claudio Kilgannon emerges from Shylos Ten", cap(K(1), "Claudio Kilgannon", "Out of Shylos Ten, the Red Army's prison planet")],
  ["His family is gone", duo("coheed", "Coheed", "cambria", "Cambria", { treatment: "slowPull" })],
  ["And the opening of this chapter finally confronts", album("sstb")],
  ["In the comic, we learn that Coheed killed", art("coheed", undefined, undefined, { treatment: "slowPull" })],
  ["It's a terrible beginning for a story", pull(K(1))],
  ["And Claudio isn't exactly getting a clean start", art("claudio")],
  ["He's haunted by the ghost of his father", duo("claudio", "Claudio", "coheed", "His father, Coheed")],
  ["They argue", art("v-coheed")],
  ["an entire military force interested in you", art("mayo", "General Mayo Deftinwolf")],
  ["Claudio has powers he hasn't used in ten years", art("claudio-good-apollo")],
  ["and Wilhelm Ryan and General Mayo Deftinwolf know he's alive", duo("ryan", "Wilhelm Ryan", "mayo", "Mayo Deftinwolf")],
  ["In the first issue, Claudio uses those powers again", cover(K(1))],
  ["A little girl calls him an angel", zoom(K(1), 0.46, 0.24, 2.0)],
  ["That's a pretty effective way to establish", art("claudio", undefined, undefined, { treatment: "slowPull" })],
  ["He's survived, but I don't think anybody", pull(K(1))],

  // ── 04 Hello Apollo ───────────────────────────────────────────────────────
  ["Now here's one of my favorite connections", pair(ALB.iks, "The album · 2003", K(1), "The comic · 2010")],
  ["The album begins with a short track called", tracklist(1)],
  ["And the first words we hear are", album("iks")],
  ["That isn't just a strange little introduction", album("iks", { treatment: "slowPull" })],
  ["The comic opens the same way", cover(K(1))],
  ["with Claudio telling the story to Apollo", art("apollo-panel", "Apollo")],
  ["outside Newo Ikkin's house", art("newo", "Newo Ikkin")],
  ["I love that", pair(ALB.iks, "The album", K(1), "The comic")],
  ["You can read the comic and recognize the moment", cover(K(1))],
  ["You can go back to the album", album("iks")],
  ["It's a direct connection, right at the beginning", tracklist(1)],
  ["So, apparently, me", photo("sbD")],
  ["The title track follows", tracklist(2)],
  ["It was already a huge part of my college soundtrack", photo("purdue", { treatment: "slowPull" })],
  ["Now, when I revisit it", art("claudio")],
  ["The album gives the whole thing its atmosphere", album("iks")],
  ["The comic gives us characters, locations", art("heavens-fence-map", "Heaven's Fence")],

  // ── 05 The war outside ────────────────────────────────────────────────────
  ["The story is bigger than Claudio's family", art("space")],
  ["Wilhelm Ryan is still the Supreme Tri-Mage", art("ryan", "Wilhelm Ryan", "The Supreme Tri-Mage")],
  ["Mayo Deftinwolf is still involved", art("mayo", "General Mayo Deftinwolf")],
  ["and the Red Army is still a problem", cover(K(3))],
  ["Meanwhile, Jesse, also known as Inferno", art("inferno", "Jesse", "Inferno")],
  ["fighting his own war from a ship called the Grail Arbor", art("v-inferno")],
  ["If you remember the", art("kbi-lineup", "The K.B.I.", "From Part 2")],
  ["And if you've forgotten", album("sstb")],
  ["This is where songs like", tracklist(3)],
  ["They belong to an album that's moving through war", cover(K(2))],
  ["The comic makes that conflict visible", cover(K(3))],
  ["I want to be careful with these connections", grid([K(2), K(3), K(4)])],
  ["It's tempting to hear a lyric", album("iks")],
  ["But these records have a lot going on", art("keywork-diagram", "The Keywork")],
  ["I'd rather show you the connections we can establish", grid(EARLY)],

  // ── 06 The Crowing ────────────────────────────────────────────────────────
  ["might have been my favorite song when I first got the album", tracklist(5)],
  ["It's still one of the songs I most associate", photo("bogota", { treatment: "slowPull" })],
  ["There's something about the way these long", album("iks", { treatment: "slowPull" })],
  ["You're several minutes in", photo("sbD", { treatment: "slowPull" })],
  ["The important story connection is right there in the title", art("claudio-good-apollo", "The Crowing", "Claudio's role in the story")],
  ["He's discovering powers he hasn't used for a decade", art("claudio")],
  ["Other people have already taken an interest", duo("ryan", "Wilhelm Ryan", "mayo", "Mayo Deftinwolf")],
  ["Ryan and Mayo want him stopped", art("ryan-throne")],
  ["So while Claudio's still trying to understand", cover(K(4))],
  ["I think that's part of what makes Claudio interesting", zoom(K(4), 0.5, 0.3, 1.9)],
  ["At this point, he's somebody who has lost almost everything", art("claudio", undefined, undefined, { treatment: "slowPull" })],
  ["And now he's supposed to figure out", pull(K(1))],
  ["particularly someone whose father is following him", duo("claudio", "Claudio", "coheed", "Coheed")],

  // ── 07 Blood Red Summer ───────────────────────────────────────────────────
  ["Then we get", tracklist(6)],
  ["became the songs that a lot of people", photo("live2009")],
  ["was released as a single in June", capAlbum("The singles", "“A Favor House Atlantic”, June 2004 · “Blood Red Summer”, November 2004")],
  ["I don't remember diving immediately into the singles", album("iks")],
  ["I was listening to the whole record", tracklist(0)],
  ["And that's something I appreciate about revisiting", pair(K(3), "#3", K(4), "#4")],
  ["Songs I originally knew by melody", album("iks")],
  ["Of course, it also means I occasionally discover", photo("sbA", { treatment: "slowPull" })],
  ["That's part of the fun", cover(K(4))],

  // ── 08 Ambellina and Sizer ────────────────────────────────────────────────
  ["Let's get back to the comic", cover(K(2))],
  ["We're introduced to Ambellina", art("ambellina", "Ambellina", "A Prise, cast out by her own kind")],
  ["There's also Sizer", art("sizer", "Sizer", "A disassembled I-Robot")],
  ["Together, they're looking for Inferno", art("inferno")],
  ["Which sounds like a reasonable plan", cover(K(3))],
  ["Inferno has his own operation underway", art("inferno", undefined, undefined, { treatment: "slowPull" })],
  ["His laboratory is building two I-Robots", duo("chase", "Chase", "sizer", "Sizer")],
  ["Chase has the mind of a grown woman", art("chase", "Chase")],
  ["That's quite a bit of information to absorb", grid(EARLY)],
  ["There are characters and relationships here", fan(FAN)],

  // ── 09 The Camper Velourium ───────────────────────────────────────────────
  ["Now we reach three consecutive songs", tracklist(7)],
  ["Faint of Hearts", tracklist(8)],
  ["In the story, the Camper Velourium is a ship", capAlbum("The Camper Velourium", "A ship in the story")],
  ["Al the Killer is a freighter pilot", capAlbum("Al the Killer", "A freighter pilot")],
  ["Claudio and his companions encounter trouble", grid(EARLY)],
  ["I especially want to talk about", tracklist(8)],
  ["This is almost my favorite Coheed song, period", photo("sbB", { treatment: "slowPull" })],
  ["And that's saying something", photo("live2009", { treatment: "slowPull" })],
  ["It's one of those songs I can revisit endlessly", album("iks")],
  ["I love having this whole three-song stretch", duo("claudio", "Claudio", "ambellina", "Ambellina")],
  ["Even before you dig into the story", album("iks", { treatment: "slowPull" })],
  ["Then comes", tracklist(9)],
  ["And this is where I want the comic in front of me", pair(K(3), "#3", K(4), "#4")],
  ["We've got a named freighter pilot", cover(K(4))],
  ["There's a lot more to examine", art("claudio")],

  // ── 10 A Favor House Atlantic ─────────────────────────────────────────────
  ["After that", tracklist(10)],
  ["I probably loved this one immediately", photo("bogota")],
  ["I missed a lot of music videos around this time", album("iks")],
  ["Yahoo was somewhere you could go watch them", photo("sbC", { treatment: "slowPull" })],
  ["It's a much shorter song", tracklist(10)],
  ["We've just come through the three Camper Velourium tracks", tracklist(9)],
  ["Now we've got a song that runs under four minutes", album("iks")],
  ["I can see why this became one of the tracks", art("claudio")],

  // ── 11 The Light & the Glass ──────────────────────────────────────────────
  ["comes next, and at nine minutes", tracklist(11)],
  ["One thing I love about these early Coheed records", photo("sbA")],
  ["They'll put a three-minute-and-change single", tracklist(10)],
  ["And for me, that contrast is part of what makes", album("iks", { treatment: "slowPull" })],
  ["By this point, we've met Claudio again", art("claudio")],
  ["learned about his family", duo("coheed", "Coheed", "cambria", "Cambria")],
  ["seen the conflict surrounding Ryan and Inferno", duo("ryan", "Wilhelm Ryan", "inferno", "Inferno")],
  ["The comics give us a way to revisit those threads", grid([K(1), K(4), K(12)])],
  ["They also remind me how much story", art("keywork-diagram")],

  // ── 12 The hidden song ────────────────────────────────────────────────────
  ["But the album still has one more trick", album("iks")],
  ["If you owned the CD, you might remember", tracklist(11)],
  ["Eleven silent tracks, in fact", tracklist(12)],
  ["And then, on track twenty-three", tracklist(23)],
  ["I loved that sort of thing", album("iks", { treatment: "slowPull" })],
  ["There's something appealing about feeling", photo("bogota", { treatment: "slowPull" })],
  ["also brings back musical ideas from", pair(ALB.sstb, "The Second Stage Turbine Blade · 2002", ALB.iks, "In Keeping Secrets · 2003")],
  ["So even this little hidden discovery", art("keywork-diagram")],
  ["Some digital versions and reissues remove", tracklist(23)],
  ["That's a shame, because the strange way", album("iks")],
  ["The vinyl includes it", album("iks", { treatment: "slowPull" })],
  ["I'll take a little unnecessary mystery", tracklist(23)],

  // ── 13 From album to comic ────────────────────────────────────────────────
  ["The album came out in October", album("iks")],
  ["The twelve-issue comic series arrived years later", grid(ALL, { columns: 6, title: "The Amory Wars: In Keeping Secrets of Silent Earth: 3", sub: "May 2010 to June 2011" })],
  ["It was published by", cap(K(1), "BOOM! Studios with Evil Ink", "Written by Claudio Sanchez and Peter David")],
  ["Chris Burnham handled early artwork", cap(K(2), "Chris Burnham", "Art on the early issues")],
  ["with other artists including", grid([K(1), K(6), K(8), K(12)], { title: "Kyle Strahm on #6 · Aaron Kuder from #8" })],
  ["I was buying the individual issues as they came out", grid(ALL, { columns: 6 })],
  ["I've still got the whole run", fan(FAN)],
  ["And I remember thinking the books felt", cover(K(2))],
  ["I was already invested in the band and the story", grid(ALL, { columns: 6 })],
  ["There are some interesting collector details here", cover(V1(1))],
  ["Issue one had a convention-exclusive cover", cap(V1(1), "#1 · Convention exclusive", "Limited to 500", undefined, { captionAlign: "right" })],
  ["Issue five had a New York Comic Con cover", cap(NYCC5, "#5 · New York Comic Con 2010", undefined, undefined, { captionAlign: "right" })],
  ["And issue nine had a", cap(C2E2_9, "#9 · C2E2 exclusive", "Limited to 300", undefined, { captionAlign: "right" })],
  ["As a Chicago collector", photo("c2e2")],
  ["I don't own either of the numbered exclusives", pair(V1(1), "#1 · Limited to 500", C2E2_9, "#9 · Limited to 300")],
  ["The series was also collected into three trade paperbacks", site("cc-work-iksse-tpb", 0.5, 0.45, 1.25)],
  ["and eventually hardcover editions and a Complete Collection", site("cc-work-iksse-tpb", 0.62, 0.9, 1.9)],
  ["The Ultimate Edition is another route", cap(ULT, "Ultimate Edition", "2012")],
  ["It's interesting to me how many different physical ways", grid([K(1), K(12), ULT])],

  // ── 14 Neverender and the legacy ──────────────────────────────────────────
  ["One thing Coheed has done over the years", photo("sbB")],
  ["the original Neverender concerts", capAlbum("Neverender · 2008", "Four albums in full, one each night")],
  ["Chicago's shows were at the Riviera Theatre", capAlbum("Chicago · Riviera Theatre", "In Keeping Secrets on night two")],
  ["they toured this entire album again", capAlbum("Neverender · 2014", "The whole album, every night")],
  ["I didn't make it to either of those particular runs", photo("sbC")],
  ["My little brother and I did attend", album("sstb")],
  ["and I've caught Coheed plenty of other times", photo("sbD")],
  ["I think that's part of why these records have stuck with me", pair(ALB.sstb, "2002", ALB.iks, "2003")],
  ["I've been following this band since I was a college kid", photo("purdue", { treatment: "slowPull" })],
  ["And the story has kept finding new ways", album("iks")],
  ["There was even a", capAlbum("S.S. Neverender", "Raiders of Silent Earth: 3")],
  ["The album also earned Gold certification", capAlbum("Certified Gold", "No. 52 on the Billboard 200")],
  ["Quite a journey for a story", album("iks", { treatment: "slowPull" })],

  // ── 15 Outro ──────────────────────────────────────────────────────────────
  ["That's where I'm going to leave", album("iks")],
  ["I've got a lot of history with this record", photo("purdue", { treatment: "slowPull" })],
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
