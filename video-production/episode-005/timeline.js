// The Amory Wars, Part 2 (channel episode 005): The Second Stage Turbine
// Blade, track by track. Narration: Tony's section files, laid out by
// build_audio.py (VOICE_PROGRAM.wav) with slots for album excerpts
// (MUSIC_PROGRAM.wav). Words in narration.words.js are already on the program
// clock. Every shot is tied to the line it illustrates. Real covers
// (ComicVine), album art, the band's 2002 site (Wayback Machine), freely
// licensed photos (credited on screen), live ComixCatalog pages.
//
// Spoiler line: nothing from inside the 2008 issues. Amory Wars II #3 to #5
// covers (dragonflies, Mayo with Mariah, the big face) only appear small, in
// grids and fans. No panels of the children; album art carries those lines.

import words from "./narration.words.js";
import plan from "./audio-plan.json" with { type: "json" };
import config from "./episode.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";

const LEAD = 0.12;
export const narrationWords = words.words;
export const stingGap = plan.sting;

const c = (name) => `covers/${name}.jpg`;
const C = {
  bag1: c("bag-on-line-sstb-001-2004"), bag2: c("bag-on-line-sstb-002-2004"),
  s1: c("amory-wars-sstb-001-2007"), s2: c("amory-wars-sstb-002-2007"), s3: c("amory-wars-sstb-003-2007"), s4: c("amory-wars-sstb-004-2007"), s5: c("amory-wars-sstb-005-2007"),
  ii1: c("amory-wars-ii-001-2008"), ii2: c("amory-wars-ii-002-2008"), ii3: c("amory-wars-ii-003-2008"), ii4: c("amory-wars-ii-004-2008"), ii5: c("amory-wars-ii-005-2008"),
  sult: c("amory-wars-sstb-ultimate-001-2010"), ks1: c("amory-wars-keeping-secrets-001-2010"),
};
const ALB = { sstb: ["2002-the-second-stage-turbine-blade", 900, 900], iks: ["2003-in-keeping-secrets-of-silent-earth-3", 1200, 1200] };
const album = (k, extra = {}) => ({ type: "panel", asset: `albums/${ALB[k][0]}.jpg`, size: [ALB[k][1], ALB[k][2]], treatment: "slowPush", ...extra });
const PH = {
  live2009: ["coheed-live-2009", 3072, 2304, "Coheed and Cambria live, 2009", "Photo: HeavyMezza89, public domain"],
  bogota: ["coheed-live-bogota-2007", 1280, 960, "Coheed and Cambria live, Bogotá, 2007", "Photo: Juan Andres Martinez, CC BY-SA 2.0"],
  travis: ["travis-stever-2014", 960, 723, "Travis Stever, 2014", "Photo: Adam Sims, CC BY-SA 4.0"],
  nyackDown: ["nyack-downtown-2015", 2448, 2448, "Nyack, New York", "Photo: Jondude11, CC BY-SA 4.0"],
};
const photo = (k, extra = {}) => ({ type: "panel", asset: `photos/${PH[k][0]}.jpg`, size: [PH[k][1], PH[k][2]], treatment: "slowPush", title: PH[k][3], sub: PH[k][4], ...extra });
const SOURCE = { "wb-coheed-av-2002": "web.archive.org · coheedandcambria.com, October 2002", "wb-coheed-2002": "web.archive.org · coheedandcambria.com, 2002" };
const screen = (asset, treatment = "push", title, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment, ...(title ? { title } : {}), ...(SOURCE[asset] ? { url: SOURCE[asset] } : {}), ...(extra.focus ? { centerFocus: true } : {}), ...extra });
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...extra });
const focus = (asset, x, y, zoom, extra = {}) => cover(asset, { treatment: "focus", focus: { x, y, zoom }, ...extra });
const grid = (assets, extra = {}) => ({ type: "grid", assets, columns: Math.min(assets.length, 6), ...extra });
const fan = (assets, extra = {}) => ({ type: "fan", assets, ...extra });
const pair = (assets, extra = {}) => ({ type: "pair", assets, ...extra });
const card = (title, kicker, sub, extra = {}) => ({ type: "chapter", title, ...(kicker ? { kicker } : {}), ...(sub ? { sub } : {}), ...extra });
const LYRIC_ART = { "Time Consumer": "s1", "Everything Evil": "s3", "Delirium Trigger": "s4", "Hearshot Kid Disaster": "s2", "33": "s3", "Junesong Provision": "s4", "Neverender": "ii1", "God Send Conspirator": "s5", "IRO-Bot": "s4" };
const lyric = (text, song) => ({ type: "quote", text, attribution: `Lyric · "${song}" · 2002`, asset: C[LYRIC_ART[song]] });
const cut = { transitionIn: "cut" };
// A cover or the album with the line as a caption, instead of a text-only card.
const capCover = (asset, title, sub, kicker, f) => ({ type: "cover", asset, treatment: f ? "focus" : "slowPush", ...(f ? { focus: { x: f[0], y: f[1], zoom: f[2] } } : {}), title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), transitionIn: "cut" });
const capAlbum = (title, sub, kicker, k = "sstb") => album(k, { title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), transitionIn: "cut" });
// Character sheets and lore art: the comic's own character designs (via the
// Coheed and Cambria Wiki) and Tony's reference images. size = real pixels.
const CH = {
  coheed: [320, 720], cambria: [320, 720], inferno: [320, 720], claudio: [320, 720], mariah: [320, 720], newo: [320, 720], ryan: [320, 720], mayo: [206, 488],
  "crom-panel": [227, 295], "apollo-panel": [255, 246], "heavens-fence-map": [1000, 770], "keywork-diagram": [500, 391], "ryan-throne": [480, 234], "kbi-lineup": [1008, 720], space: [1360, 765],
};
const art = (k, title, sub, extra = {}) => ({ type: "panel", asset: `characters/${k}.png`, size: CH[k], treatment: "slowPush", maxUpscale: 2.2, ...(title ? { title } : {}), ...(sub ? { sub } : {}), transitionIn: "cut", ...extra });
const duo = (a, la, b, lb, extra = {}) => pair([{ asset: `characters/${a}.png`, aspect: CH[a][0] / CH[a][1], label: la }, { asset: `characters/${b}.png`, aspect: CH[b][0] / CH[b][1], label: lb }], { transitionIn: "cut", ...extra });
const TRACKS = ["Second Stage Turbine Blade", "Time Consumer", "Devil in Jersey City", "Everything Evil", "Delirium Trigger", "Hearshot Kid Disaster", "33", "Junesong Provision", "Neverender", "God Send Conspirator"];
const LENGTHS = ["0:54", "5:43", "4:48", "5:52", "4:47", "5:42", "3:31", "5:22", "5:23", "13:45"];
// n = 0: the band's own 2002 discography page (Wayback). n > 0: the track
// listing card with track n lit.
const tracklist = (n) => n
  ? { type: "tracklist", asset: `albums/${ALB.sstb[0]}.jpg`, kicker: "The Second Stage Turbine Blade · 2002", tracks: TRACKS.map((title, i) => ({ title, length: LENGTHS[i] })), current: n, transitionIn: "cut" }
  : screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.36, y: 0.5 }, zoom: 1.5 });

const SSTB07 = [C.s1, C.s2, C.s3, C.s4, C.s5];
const II = [C.ii1, C.ii2, C.ii3, C.ii4, C.ii5];
const TEN = [...SSTB07, ...II];
// Fans stack the last item on top: keep the 2008 covers underneath.
const FAN10 = [C.ii5, C.ii4, C.ii3, C.ii2, C.ii1, C.s5, C.s4, C.s3, C.s2, C.s1];

const CUES = [
  // ── 01 Cold open (fades up from black; the bed fades in under it) ─────────
  ["This is a comic book channel", { ...fan(FAN10), transitionIn: "fade", fadeIn: 36 }],
  ["so why are we talking about a rock album", album("sstb", cut)],
  ["Because Coheed and Cambria's first record", pair([{ asset: `albums/${ALB.sstb[0]}.jpg`, aspect: 1, label: "The album · 2002" }, { asset: C.s1, label: "The comic · 2007" }], cut)],
  ["And the lyrics name the cast", art("kbi-lineup")],

  // ── 02 The plan ─────────────────────────────────────────────────────────
  ["This is the Second Stage Turbine Blade", album("sstb", cut)],
  ["Ten tracks", tracklist(0)],
  ["these songs name names", card("Named in\nthe lyrics", "The Second Stage Turbine Blade · 2002", undefined, cut)],
  ["The twins", capCover(C.s1, "Matthew and Maria", undefined, "Named in the lyrics")],
  ["Josephine's fiance", capCover(C.s3, "Patrick", undefined, "Named in the lyrics")],
  ["Claudio's girlfriend", duo("newo", "Newo", "apollo-panel", "Apollo")],
  ["the two guys flying the spaceship", capCover(C.s4, "Norris and Larry", "The two guys flying the spaceship", "Named in the lyrics")],
  ["So that's today", tracklist(0)],
  ["A little of the song", album("sstb", { treatment: "slowPull", ...cut })],
  ["the part of the comic it lines up with", grid(SSTB07, { columns: 5, ...cut })],
  ["and the books themselves", fan(FAN10)],
  ["one of these song titles is a character", focus(C.ii2, 0.5, 0.45, 1.25, cut)],
  ["I'm Tony", capAlbum("The Second Stage Turbine Blade", undefined, "ComixCatalog Originals · The Amory Wars · Part 2")],
  ["Two quick notes", card("No spoilers\npast this album", "Two quick notes", undefined, cut)],
  ["this one gets dark", focus(C.s3, 0.5, 0.25, 1.4, cut)],
  ["It was always going to get dark", album("sstb", { treatment: "slowPull", ...cut })],

  // ── 03 The record ───────────────────────────────────────────────────────
  ["Quick set up since we covered", capAlbum("The record", "March 5, 2002 · Equal Vision Records")],
  ["came out March 5", screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.38, y: 0.38 }, zoom: 2.2, ...cut })],
  ["They recorded it in the fall of 2001", screen("wb-coheed-2002", "push", "Recorded fall 2001 · Paramus, New Jersey")],
  ["Claudio Sanchez on vocals", photo("bogota", cut)],
  ["Travis Stever on lead guitar", photo("travis", cut)],
  ["Michael Todd on bass", photo("live2009", { treatment: "slowPull", ...cut })],
  ["a drummer named Nate", screen("wb-coheed-av-2002", "push", "Nate Kelley drums on \"Delirium Trigger\" and \"33\"", { focus: { x: 0.36, y: 0.5 }, zoom: 2.0 })],
  ["I heard this album on a burned CD", screen("wb-coheed-2002", "push", "The band's site, 2002", cut)],
  ["I was there for the music", photo("live2009", cut)],
  ["The proggy guitars", photo("travis", { treatment: "slowPull", ...cut })],
  ["The story came later", album("sstb", cut)],
  ["That's what the comics are for", grid(SSTB07, { columns: 5, ...cut })],
  ["This story got turned into comics", pair([{ asset: C.bag1, label: "2004" }, { asset: C.s1, label: "2007" }], cut)],
  ["The one we're following today", grid(TEN, { columns: 5, title: "The Amory Wars: The Second Stage Turbine Blade", ...cut })],
  ["That's the complete version", cover(C.sult, cut)],
  ["Last thing", album("sstb", { treatment: "slowPull", ...cut })],
  ["The album came first", tracklist(0)],
  ["So when I say a song lines up", grid(SSTB07, { columns: 5, ...cut })],

  // ── 04 Track 1 ──────────────────────────────────────────────────────────
  ["Track one is the title track", tracklist(1)],
  ["So let's use that minute", album("sstb", cut)],
  ["Heaven's Fence", art("space", "Heaven's Fence")],
  ["78 planets and seven stars", art("keywork-diagram", "78 planets, 7 stars", "Held together by the Keywork")],
  ["Running the whole thing is Wilhelm Ryan", art("ryan", "Wilhelm Ryan", "The Supreme Tri-Mage")],
  ["Which is a great title", art("ryan-throne")],
  ["And on one of those planets", cover(C.s1, cut)],
  ["Coheed and Cambria Kilgannon", duo("coheed", "Coheed", "cambria", "Cambria")],
  ["House in the suburbs", focus(C.s4, 0.5, 0.45, 1.3, cut)],
  ["Josephine is the oldest", art("claudio", "The Kilgannon kids", "Josephine · Claudio · Matthew · Maria")],
  ["Remember those names", album("sstb", { treatment: "slowPull", ...cut })],

  // ── 05 Time Consumer ────────────────────────────────────────────────────
  ["Track two Time Consumer", tracklist(2)],
  ["This is where it starts going wrong", cover(C.s1, cut)],
  ["Coheed's been having nightmares", focus(C.s1, 0.42, 0.35, 1.7, cut)],
  ["Cambria tells him it's just a dream", focus(C.s4, 0.62, 0.38, 1.8, cut)],
  ["Then one day after work", cover(C.s2, cut)],
  ["General Mayo Deftinwolf", art("mayo", "General Mayo Deftinwolf", "Wilhelm Ryan's army")],
  ["And Mayo tells Coheed the nightmares are real", focus(C.s2, 0.62, 0.26, 2.2)],
  ["Turns out Coheed and Cambria had a whole other life", focus(C.s4, 0.48, 0.45, 1.3, cut)],
  ["Knowledge Beast and Inferno", art("kbi-lineup", "The K.B.I.", "The Knowledge, Cambria · The Beast, Coheed · The Inferno, Jesse")],
  ["Cambria was knowledge", art("cambria", "The Knowledge", "Cambria sees things before they happen")],
  ["Coheed was beast", art("coheed", "The Beast", "Coheed fights his way out of almost anything")],
  ["And Inferno is Jesse", art("inferno", "The Inferno", "Jesse, Coheed's brother")],
  ["Their memories were wiped", focus(C.s1, 0.42, 0.35, 1.4, cut)],
  ["It's called the Monstar", art("heavens-fence-map", "The Monstar", "A virus hidden inside Coheed. It can wreck the Keywork.")],
  ["So far that's a bad day", focus(C.s2, 0.62, 0.26, 1.6, cut)],
  ["He says the virus got passed on to the kids", album("sstb", { treatment: "slowPush", ...cut })],
  ["Then he drives off", focus(C.s2, 0.25, 0.45, 1.6, cut)],
  ["What Coheed doesn't know is that Mayo's lying", focus(C.s2, 0.62, 0.26, 2.0, cut)],
  ["Coheed and Cambria have been set up", { type: "quote", text: "To save these worlds, Coheed and his wife, Cambria, must do the unthinkable.", attribution: "Amory Wars #1 solicitation, 2007", asset: C.s1, ...cut }],
  ["Now listen to the chorus", lyric("Matthew good night\nMaria my star", "Time Consumer")],
  ["There's another line in here", lyric("When did I say to murder?", "Time Consumer")],
  ["I'll leave it there", album("sstb", { treatment: "slowPull", ...cut })],

  // ── 06 Devil in Jersey City ─────────────────────────────────────────────
  ["Track three Devil in Jersey City", tracklist(3)],
  ["That's Claudio yelling", photo("nyackDown", { title: "Shabütie", ...cut })],
  ["If you watched part one", capAlbum("Coheed and Cambria's first single", "\"Devil in Jersey City\"")],
  ["This was the band's first single", screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.33, y: 0.16 }, zoom: 2.4, ...cut })],
  ["The Jersey City Devils are a gang", capCover(C.s2, "The Jersey City Devils", "A gang in The Amory Wars")],
  ["That same night", cover(C.s2, cut)],
  ["The Devils attack them", album("sstb", { treatment: "slowPush", ...cut })],
  ["She asks Patrick to take her home", focus(C.s2, 0.45, 0.75, 1.2, cut)],
  ["And this is the part that makes it worse", cover(C.s3, cut)],
  ["She's an IRO bot", capCover(C.s3, "Josephine Kilgannon", "An IRO-bot, built by Dr. Leonard Hohenberger")],
  ["She was built to be the antidote", art("coheed", "The antidote", "Josephine is the cure for the Monstar inside Coheed")],
  ["She's also telepathically linked", focus(C.s4, 0.62, 0.38, 1.6, cut)],
  ["So the one person who could actually fix", album("sstb", { treatment: "slowPull", ...cut })],

  // ── 07 Everything Evil ──────────────────────────────────────────────────
  ["Track four Everything Evil", tracklist(4)],
  ["The lyrics name the Monstar", lyric("Evolve! Monstar!", "Everything Evil")],
  ["They name Jesse", lyric("Jesse!", "Everything Evil")],
  ["the song ends with somebody screaming", lyric("She screamed Claudio,\ndear Claudio", "Everything Evil")],
  ["So the house", album("sstb", { treatment: "slowPush", ...cut })],
  ["Then the soldiers show up", cover(C.s2, cut)],
  ["Mayo tells him to ask his wife", focus(C.s2, 0.62, 0.26, 1.8, cut)],
  ["So Cambria looks into Mayo's head", art("cambria")],
  ["The kids never had the virus", art("mayo", "It was a lie", "The kids never had the virus")],
  ["Coheed loses it", focus(C.s1, 0.4, 0.4, 1.4, cut)],
  ["Blades come out of his arm", focus(C.s1, 0.3, 0.55, 1.6, cut)],
  ["They finally knock him out", focus(C.s2, 0.3, 0.45, 1.5, cut)],
  ["So where's Claudio", art("claudio", "Where's Claudio?")],
  ["Stuck in traffic", duo("claudio", "Claudio", "newo", "Newo", { title: "Stuck in traffic", sub: "After curfew" })],
  ["The one time in history", album("sstb", { treatment: "slowPull", ...cut })],
  ["When he finally gets home", cover(C.s3, cut)],
  ["He holds her", focus(C.s3, 0.45, 0.62, 1.4, cut)],
  ["For a moment she comes back", focus(C.s3, 0.42, 0.45, 1.8)],
  ["the last thing she says to him", lyric("We'll make it\nif you believe", "Everything Evil")],
  ["Then a Priest comes out of the dark", focus(C.s3, 0.5, 0.2, 1.6, cut)],
  ["Think shape-shifting monsters", focus(C.s3, 0.5, 0.18, 2.2, cut)],
  ["Claudio swings at it", focus(C.s3, 0.42, 0.42, 1.5, cut)],
  ["And then Claudio turns invisible", cover(C.ii1, { treatment: "slowPull", ...cut })],
  ["I'm not going to explain the powers", focus(C.ii1, 0.4, 0.4, 1.4, cut)],
  ["the kid nobody was supposed to worry about", focus(C.ii1, 0.42, 0.35, 1.9)],

  // ── 08 Delirium Trigger ─────────────────────────────────────────────────
  ["Track five Delirium Trigger", tracklist(5)],
  ["This song sounds like", lyric("Terror on the intercom", "Delirium Trigger")],
  ["Systems malfunction", lyric("Systems malfunction", "Delirium Trigger")],
  ["There's a photograph of Earth", lyric("A photograph of Earth", "Delirium Trigger")],
  ["And that's exactly where Coheed and Cambria wake up", cover(C.s4, cut)],
  ["on a ship called the Gloria", capCover(C.s4, "The Gloria Vel Vessa", "Bound for Paris: Earth")],
  ["Coheed opens his eyes", focus(C.s1, 0.42, 0.33, 2.0, cut)],
  ["I remember", art("coheed", "\"I remember.\"")],
  ["The memory wipe is gone", focus(C.s4, 0.48, 0.45, 1.3, cut)],
  ["Coheed breaks out of his tank", focus(C.s4, 0.4, 0.5, 1.6, cut)],
  ["Cambria shatters hers", focus(C.s4, 0.62, 0.4, 1.7, cut)],
  ["Then the two of them fight", cover(C.s4, { treatment: "slowPull", ...cut })],
  ["And this is where we get the other arm", focus(C.s4, 0.3, 0.35, 1.8, cut)],
  ["So that's blades on the left", art("coheed", "Blades on the left, a cannon on the right", "On a suburban dad")],
  ["They take the control room", focus(C.s4, 0.5, 0.75, 1.4, cut)],
  ["The ship's on autopilot", capCover(C.s4, "Autopilot", "Steered from the Red Army's space port", undefined, [0.5, 0.75, 1.4])],
  ["They hijacked a ship", cover(C.s4, cut)],

  // ── 09 Hearshot Kid Disaster ────────────────────────────────────────────
  ["Track six", tracklist(6)],
  ["This one's got Mayo all over it", lyric("I need Mayo", "Hearshot Kid Disaster")],
  ["Dear Captain send the SOS", lyric("Dear Captain,\nsend the S.O.S.", "Hearshot Kid Disaster")],
  ["a line about Paris in flames", lyric("Paris in flames", "Hearshot Kid Disaster")],
  ["So let's check in on Mayo", focus(C.s2, 0.62, 0.26, 1.6, cut)],
  ["Coheed and Cambria took the ship", focus(C.s4, 0.48, 0.45, 1.3, cut)],
  ["Patrick got away", focus(C.s2, 0.45, 0.75, 1.3, cut)],
  ["Claudio got away", focus(C.s3, 0.42, 0.45, 1.4, cut)],
  ["And Wilhelm Ryan is not the forgiving type", art("ryan-throne", "Wilhelm Ryan", "Not the forgiving type")],
  ["So in walks Admiral", art("crom-panel", "Admiral Vielar Crom")],
  ["The comics call him", { type: "quote", text: "...who may be the most dangerous man on Heaven's Fence.", attribution: "Amory Wars #4 solicitation, 2007", asset: C.s4, ...cut }],
  ["Metal mask", focus(C.ii2, 0.3, 0.45, 2.0, cut)],
  ["And he tells Mayo he's been demoted", focus(C.s2, 0.62, 0.26, 2.0, cut)],
  ["Mayo gets reassigned", art("mayo", "\"The flies.\"", "Mayo's new job")],
  ["Yeah the flies", cover(C.s5, cut)],
  ["Now the title", tracklist(6)],
  ["He doesn't show up until the second half", grid(II, { columns: 5, highlight: 1, ...cut })],
  ["Claudio ends up on a garbage planet", focus(C.ii1, 0.45, 0.45, 1.3, cut)],
  ["And the prisoners all talk about one of them", cover(C.ii2, cut)],
  ["They call him the Hearshot Kid", capCover(C.ii2, "The Hearshot Kid", "Amory Wars II #2 · 2008")],
  ["One song title", tracklist(6)],

  // ── 10 33 ───────────────────────────────────────────────────────────────
  ["Track seven", tracklist(7)],
  ["This is Patrick", lyric("Patrick", "33")],
  ["Patrick McCormick", capCover(C.s3, "Patrick McCormick", "Josephine's fiancé")],
  ["Which makes him a loose end", cover(C.s3, cut)],
  ["And Ryan sends Priests", focus(C.s3, 0.5, 0.2, 1.7, cut)],
  ["Patrick goes to a dive bar", cover(C.s3, { treatment: "slowPull", ...cut })],
  ["A Priest finds them both", focus(C.s3, 0.5, 0.18, 2.1, cut)],
  ["Then down by the Jersey City docks", cover(C.s4, cut)],
  ["A guy on a megaphone", capCover(C.s3, "\"FBI.\"", "Drop the gun. Hands up.", undefined, [0.5, 0.75, 1.3])],
  ["And then the cars disappear", focus(C.s3, 0.5, 0.2, 1.5, cut)],
  ["into a winged dragon thing", focus(C.s3, 0.5, 0.15, 2.4)],
  ["The FBI was a costume", capCover(C.s3, "The FBI was a costume", undefined, undefined, [0.5, 0.18, 2.0])],
  ["The song ends up in an emergency room", lyric("Flat line", "33")],
  ["Patrick doesn't get away", cover(C.s5, { treatment: "still", ...cut })],
  ["Side note", card("Patrick Ewing · #33", "A fan theory", "Never confirmed", cut)],
  ["I'd like it to be true", album("sstb", cut)],

  // ── 11 Junesong Provision ───────────────────────────────────────────────
  ["Track eight", tracklist(8)],
  ["This one reads like letters", album("sstb", cut)],
  ["how's Apollo been treating you", lyric("Dear Newo Ikkin,\nhow's Apollo been\ntreating you?", "Junesong Provision")],
  ["Newo is Claudio's girlfriend", art("newo", "Newo Ikkin", "Claudio's girlfriend")],
  ["Apollo is her dog", art("apollo-panel", "Apollo", "Her dog")],
  ["After the Priest Claudio goes to her house", focus(C.ii1, 0.45, 0.4, 1.4, cut)],
  ["He wants to tell her", focus(C.s3, 0.42, 0.45, 1.6, cut)],
  ["He takes a picture of her", focus(C.ii1, 0.42, 0.35, 1.9, cut)],
  ["Keeping her out of it", album("sstb", { treatment: "slowPull", ...cut })],
  ["the song jumps to the ship", cover(C.s4, cut)],
  ["Norris and Larry Gloria to nowhere", lyric("Norris and Larry,\nGloria to nowhere", "Junesong Provision")],
  ["Norris and Larry are Captain", capCover(C.s4, "Capt. Norris Henderson · Lt. Larry Goswell", "The Gloria Vel Vessa")],
  ["I said the songs name the guys", capCover(C.s4, "Norris and Larry", "Named in the lyrics", undefined, [0.45, 0.45, 1.4])],
  ["And there's another line", lyric("Captain! We've lost\nall systems control", "Junesong Provision")],
  ["In the comics Coheed tries to rewire", focus(C.s4, 0.4, 0.5, 1.5, cut)],
  ["Cambria gets angry", focus(C.s4, 0.62, 0.38, 2.0, cut)],
  ["Lost all systems control", cover(C.s4, { treatment: "slowPull", ...cut })],

  // ── 12 Neverender ───────────────────────────────────────────────────────
  ["Track nine", tracklist(9)],
  ["Another letter", lyric("Dear Mom and Dad,\nI write you in this letter", "Neverender")],
  ["A son telling his parents", lyric("Forget your son when\nhe's out on his own", "Neverender")],
  ["That's Claudio leaving", focus(C.s3, 0.42, 0.45, 1.5, cut)],
  ["He's hiding from the police", cover(C.ii1, cut)],
  ["Then he sneaks onto a garbage hauler", capCover(C.ii1, "The Guile Griever", "An interplanetary garbage hauler")],
  ["and watches his home planet", focus(C.ii1, 0.45, 0.45, 1.5)],
  ["No family", focus(C.ii1, 0.42, 0.35, 2.0, cut)],
  ["That's our hero", cover(C.ii1, { treatment: "slowPull", ...cut })],
  ["Fun fact", photo("live2009", { title: "Neverender, 2008", kicker: "Four nights · one album per night", ...cut })],
  ["four-night run of shows", photo("live2009", { treatment: "slowPull", ...cut })],
  ["Meanwhile on the Gloria", cover(C.s4, cut)],
  ["From a ship that's shooting at them", focus(C.s5, 0.5, 0.75, 1.4, cut)],
  ["It's Jesse", art("inferno", "Jesse", "The Inferno")],

  // ── 13 God Send Conspirator / IRO-Bot ───────────────────────────────────
  ["Track 10", tracklist(10)],
  ["On the original CD this track runs", capAlbum("13:45", "\"God Send Conspirator\" on the original CD, hidden track included")],
  ["dear Mariah", lyric("Dear Mariah", "God Send Conspirator")],
  ["Jesse is inferno", art("inferno", "The Inferno", "The I in K.B.I. · Coheed's brother · IRO-bot")],
  ["leads a rebellion against Wilhelm Ryan", focus(C.s5, 0.48, 0.3, 1.6, cut)],
  ["She was the Messiah", art("mariah", "Mariah Antillarea", "Rebel leader, once believed to be the Messiah")],
  ["He's done waiting", cover(C.s5, cut)],
  ["He wants to take the war", focus(C.s5, 0.5, 0.75, 1.3, cut)],
  ["Jesse's my favorite", art("inferno", "My favorite", "He gets things done")],
  ["He's driven by revenge", focus(C.s1, 0.5, 0.65, 1.4, cut)],
  ["Case in point", focus(C.s4, 0.48, 0.45, 1.3, cut)],
  ["So he jumps in his ship", cover(C.s5, cut)],
  ["with his brother on it", focus(C.s4, 0.4, 0.45, 1.6, cut)],
  ["He attacks the ship", focus(C.s5, 0.5, 0.75, 1.6, cut)],
  ["He gives them an hour", capCover(C.s5, "One hour", "Turn the ship around")],
  ["That's Jesse", focus(C.s5, 0.48, 0.3, 1.9, cut)],
  ["Then Ryan's forces seize the ship", cover(C.s4, cut)],
  ["That's where the first five chapters end", grid(SSTB07, { columns: 5, ...cut })],
  ["The second half picks up", fan([C.ii5, C.ii4, C.ii3, C.ii2, C.ii1])],
  ["Admiral Krom earns his reputation", art("crom-panel")],
  ["I'm saving for part three", album("iks", cut)],
  ["One thing I can tell you", tracklist(10)],
  ["There's a background line", lyric("Your dreams can't\nlast forever", "God Send Conspirator")],
  ["That's also the last line", grid(II, { columns: 5, ...cut })],
  ["then the piano comes in", album("sstb", { treatment: "slowPull", ...cut })],
  ["the hidden track", art("kbi-lineup", "IRO-Bot", "The hidden track")],
  ["it's sung from a robot's point of view", lyric("My gun I've left behind\nIRO-Bot will never die", "IRO-Bot")],
  ["coheed's an", duo("coheed", "Coheed", "inferno", "Jesse", { title: "IRO-bots", sub: "Coheed, Jesse, and Josephine" })],
  ["Not a bad way to end a record", album("sstb", { treatment: "slowPull", ...cut })],

  // ── 14 Three versions ───────────────────────────────────────────────────
  ["Quick word on the comics", grid([C.bag1, C.s1, C.sult], { columns: 3, title: "Three versions, one story", ...cut })],
  ["The first try was the Bag", pair([{ asset: C.bag1, label: "#1 · 2004" }, { asset: C.bag2, label: "#2 · 2004" }], { title: "The Bag On Line Adventures", sub: "Evil Ink · Art: Wes Abbott", ...cut })],
  ["I bought both at a Hot Topic", screen("cc-bag-on-line", "push", "The Bag On Line Adventures on ComixCatalog")],
  ["I wanted anything Coheed", cover(C.bag1, cut)],
  ["Then in 2007 it started over", grid(SSTB07, { columns: 5, ...cut })],
  ["Ten chapters across 2007 and 2008", grid(TEN, { columns: 5, ...cut })],
  ["Gus Vazquez drew the first two", pair([{ asset: C.s1, label: "#1 · Gus Vazquez" }, { asset: C.s2, label: "#2 · Gus Vazquez" }], cut)],
  ["Mike S Miller the next three", { type: "grid", assets: [C.s3, C.s4, C.s5], columns: 3, title: "Mike S. Miller", ...cut }],
  ["Gabriel Guzman the last five", grid(II, { columns: 5, title: "Gabriel Guzman", ...cut })],
  ["Tony Moore from the Walking Dead", fan(FAN10)],
  ["a variant cover sold only at Hot Topic", screen("cc-issue-amory-wars-1", "push", "Amory Wars #1 had a variant cover", { focus: { x: 0.23, y: 0.63 }, zoom: 2.2 })],
  ["Of course there was", cover(C.s1, cut)],
  ["The 2007 art was kind of meh", focus(C.s4, 0.5, 0.5, 1.2, cut)],
  ["But I wanted the rest of the story", grid(TEN, { columns: 5, ...cut })],
  ["In 2010", cover(C.sult, cut)],
  ["About 350 pages", focus(C.sult, 0.5, 0.88, 1.6, cut)],
  ["All of these are on", screen("cc-search-amory-wars", "push", "The Amory Wars on ComixCatalog", { focus: { x: 0.45, y: 0.35 }, zoom: 1.2 })],
  ["the 2007 and 2008 series", screen("cc-amory-wars-ii-2008", "panDown", "Amory Wars II (2008)")],
  ["and the Ultimate Edition", screen("cc-sstb-ultimate", "push", "Ultimate Edition (2010)")],
  ["You can look up every issue", screen("cc-issue-amory-wars-1", "push", "Amory Wars #1 (2007)")],
  ["add the ones you own", screen("cc-issue-amory-wars-1", "push", undefined, { focus: { x: 0.72, y: 0.3 }, zoom: 2.2, ...cut })],
  ["Signing up is free", screen("cc-amory-wars-ii-2008", "push", undefined, { focus: { x: 0.68, y: 0.63 }, zoom: 1.9, ...cut })],

  // ── 15 Ending ───────────────────────────────────────────────────────────
  ["So that's the Second Stage", album("sstb", cut)],
  ["a cast list hiding in the lyrics", card("Matthew · Maria · Patrick · Newo\nApollo · Norris · Larry · Mariah", "Named in the lyrics", undefined, cut)],
  ["When I first heard this record", screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.38, y: 0.32 }, zoom: 1.6, ...cut })],
  ["The comics gave me a reason", grid(TEN, { columns: 5, ...cut })],
  ["Next time it's In Keeping Secrets", album("iks", cut)],
  ["We find out what happens", cover(C.ks1, cut)],
  ["If you're into stories about comics", card("New episode every Sunday", "ComixCatalog on YouTube", "Shorts Tuesday · Thursday · Saturday", cut)],
  ["And tell me in the comments", tracklist(0)],
  ["I'm Tony thanks for watching", album("sstb", { treatment: "slowPull", ...cut })],
];

const resolved = resolveAnchors(narrationWords, CUES.map(([phrase]) => phrase));
export const anchorMisses = resolved.misses;
// The four cold-open cues wait on the re-recorded 01 file; until then they sit between neighbours.
const COLD_OPEN_CUES = 4;
if (anchorMisses.some((m) => m.index >= COLD_OPEN_CUES)) throw new Error(`episode-005: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - LEAD).toFixed(3), beat: phrase }));
// The open fades up from black at 0 s, under the first words.
segments[0].at = 0;

// Album intros and swells: the voice is silent, so these are placed from the
// audio plan instead of a phrase.
for (const m of plan.music) {
  if (m.kind === "intro") segments.push({ ...capAlbum(TRACKS[m.track - 1], "The Second Stage Turbine Blade · 2002", `Track ${m.track} · ${LENGTHS[m.track - 1]}`), at: m.at, beat: `Intro: ${TRACKS[m.track - 1]}` });
  if (m.kind === "swell" && m.key === "ee_piano") segments.push({ ...album("sstb", { treatment: "slowPull" }), at: m.at, beat: "Everything Evil piano" });
  if (m.kind === "swell" && m.key === "gsc_piano") segments.push({ ...capAlbum("The piano", "Same piece as the end of \"Everything Evil\""), at: m.at, beat: "God Send Conspirator piano" });
  if (m.kind === "swell" && m.key === "irobot") segments.push({ ...art("kbi-lineup", "IRO-Bot", "The hidden track"), at: m.at, beat: "IRO-Bot excerpt" });
}
segments.push({ type: "sting", at: stingGap.at, beat: "Channel sting", transition: "cut" });
segments.push({ type: "end", at: plan.endCard, dur: plan.duration - plan.endCard, beat: "End card", title: "Next: In Keeping Secrets of Silent Earth: 3", sub: "What's your favorite track on this album?", transitionIn: "cut" });
segments.sort((x, y) => x.at - y.at);

export default {
  id: "episode-005", assetEpisodeId: "episode-005", outputDir: "episode-005", outputName: "episode-005", compositionId: "Episode005",
  title: config.titleOptions[0], duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/VOICE_PROGRAM.wav", at: 0, volume: 1 },
    // Pre-built by build_music.py: album intros at full, songs under the voice, Rollin at 5 under the non-track sections.
    music: { asset: "audio/MUSIC_PROGRAM.wav", volume: 1, fadeIn: 0, fadeOut: 2, loop: false },
    // Funkorama's band enters at 7.13 s; start there so the hit lands with the logo.
    sting: { asset: "audio/MUSIC_STING.mp3", at: stingGap.at, from: 7.1, dur: stingGap.dur, volume: 1, fadeOut: 0.4 },
  },
};
