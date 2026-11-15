// Episode 007 · Every Generation Has Its Own Batman. First hybrid episode:
// Tony on camera at his bookshelf (six scenes, cut from
// batman_through_the_generations.mp4) plus his own VO takes, all laid out on
// one program clock by build_audio.py (VOICE_PROGRAM.wav). Camera pictures are
// muted `camera` segments that seek into their clip, so a cutaway can
// interrupt a take and come back in sync. Every other shot is real art:
// ComicVine covers, DC/Marvel Database panels (episode-007 fetch_*.py), Batman
// #5 (2011) pages via Comics Bookcase, live ComixCatalog pages. No text cards.

import words from "./narration.words.js";
import plan from "./audio-plan.json" with { type: "json" };
import SIZES from "./sizes.js";
import { resolveAnchors } from "../shared/anchors.js";

const LEAD = 0.12;
export const narrationWords = words.words;

const c = (n) => `covers/${n}.jpg`;
const C = {
  dkr1: c("dark-knight-returns-001-1986"), dkr2: c("dark-knight-returns-002-1986"), dkr3: c("dark-knight-returns-003-1986"), dkr4: c("dark-knight-returns-004-1986"),
  b492: c("batman-492-1993"), b497: c("batman-497-1993"), b498: c("batman-498-1993"), b500: "covers/alt/batman-500-1993-alt-a.jpg",
  soa1: c("sword-of-azrael-001-1992"), soa2: c("sword-of-azrael-002-1992"), soa3: c("sword-of-azrael-003-1992"), soa4: c("sword-of-azrael-004-1993"),
  brAdapt: c("batman-returns-adaptation-001-1992"), adv1: c("batman-adventures-001-1992"),
  n1: c("batman-2011-001-2011"), n2: c("batman-2011-002-2011"), n3: c("batman-2011-003-2012"), n4: c("batman-2011-004-2012"),
  n5: c("batman-2011-005-2012"), n6: c("batman-2011-006-2012"), n7: c("batman-2011-007-2012"),
  a1: c("absolute-batman-001-2024"), a2: c("absolute-batman-002-2025"), a3: c("absolute-batman-003-2025"),
  a4: c("absolute-batman-004-2025"), a5: c("absolute-batman-005-2025"), a6: c("absolute-batman-006-2025"),
  hox: c("house-of-x-001-2019"), pox: c("powers-of-x-001-2019"),
  wosm118: c("web-of-spider-man-118-1994"), sens0: c("sensational-spider-man-000-1996"),
};
const ABS = [C.a1, C.a2, C.a3, C.a4, C.a5, C.a6];
const NEW52 = [C.n1, C.n2, C.n3, C.n4, C.n5, C.n6, C.n7];
const SOA = [C.soa1, C.soa2, C.soa3, C.soa4];
const DKR = [C.dkr1, C.dkr2, C.dkr3, C.dkr4];
// Fans stack the last item on top.
const ERAS = [C.dkr1, C.adv1, C.b500, C.n5, C.a1];

const A = {
  // Azrael: his own costume first, then the armored Batman suit (Tony, 11-13).
  azOriginal: "art/azrael-gallery/Azrael_Jean-Paul_Valley_0018.jpg",
  azSwords: "art/azrael-gallery/Azrael_Jean-Paul_Valley_0003.jpg",
  azGauntlets: "art/azrael-gallery/Azrael_Jean-Paul_Valley_0027.jpg",
  azHood: "art/azrael-gallery/Azrael_Jean-Paul_Valley_0002.jpg",
  azbatsDescent: "art/batman-500/Batman_Jean-Paul_Valley_0011.jpg",
  azbatsManley: "art/azrael-gallery/Batman_Jean-Paul_Valley_0014.jpg",
  azbatsStorm: "art/azrael-gallery/Batman_Jean-Paul_Valley_0001.jpg",
  azbatsClaws: "art/azrael-gallery/Batman_Jean-Paul_Valley_0027.jpg",
  azbatsRed: "art/azrael-gallery/Batman_Jean-Paul_Valley_0006.jpg",
  breakYou: "art/batman-497/Bane_0020.jpg",
  bane: "art/bane/Bane_0001.jpg",
  dkr1: "art/dkr-1/Batman_-_Dark_Knight_Returns_1.jpg",
  dkr4: "art/dkr-4/Batman_-_Dark_Knight_Returns_4.jpg",
  absMiller: "art/absolute-batman-1/Absolute_Batman_Vol_1_1_Variant_Cover_NYCC_Frank_Miller_Jock.jpg",
  absTextless: "art/absolute-batman-1/Absolute_Batman_Vol_1_1_Textless.jpg",
  poster: "art/batman-returns-film/Batman_Returns.jpg",
  snes: "art/batman-returns-film/Batman_Returns_Nintendo_.jpg",
  segaCd: "art/batman-returns-film/Batman_Returns_Sega_CD_Box.jpg",
  brComic: "art/batman-returns-film/Batman_Returns_Comic.jpg",
  villains: "art/classic-penguin/Batman_Villains_0003.jpg",
  family: "art/absolute-alfred/Batman_Family_0001.jpg",
  owls: "art/court-of-owls/Court_of_Owls_008.jpg",
  owlsTower: "art/court-of-owls/Court_of_Owls_006.jpg",
  owlsWest: "art/court-of-owls/All-Star_Western_Vol_3_9_Textless.jpg",
  talon: "art/court-of-owls/Talon_007.jpg",
  mazeCover: "art/batman-2011-5/Batman_Vol_2_5_Alternate.jpg",
  n52Textless: "art/batman-2011-1/Batman_Vol_2_1_Textless.jpg",
  absEddie: "art/absolute-nygma/Eddie_Absolute_Universe_004.jpg",
  absDent: "art/absolute-dent/Absolute_Batman_Vol_1_21_Textless.jpg",
  absOzzie: "art/absolute-cobblepot/Absolute_Batman_Vol_1_21_Textless_Dragotta_Variant.jpg",
  absWaylon: "art/absolute-jones/Absolute_Batman_Vol_1_12_Textless.jpg",
  absAlfred: "art/absolute-alfred/Alfred_Pennyworth_Absolute_Universe_0002.png",
  absSionis: "art/absolute-sionis/Roman_Sionis_Absolute_Universe_001.jpeg",
  twoFace: "art/classic-two-face/Two-Face_0002.jpg",
  penguin: "art/classic-penguin/Penguin_0001.jpg",
  croc: "art/classic-killer-croc/Killer_Croc_0002.jpg",
  alfred: "art/classic-alfred/Alfred_Pennyworth_0001.jpg",
  blackMask: "art/classic-black-mask/Black_Mask_0002.jpg",
  benCard: "art/ben-reilly/Ben_Reilly_Earth-616_from_Marvel_Masterpieces_Trading_Cards_1995_Set_0001.jpg",
  benSpidey: "art/ben-reilly/Ben_Reilly_Earth-616_from_Spider-Man_Vol_1_67_0001.jpg",
};
const PG = (n) => `art/batman-2011-5-pages/page-${n}.${n === 12 ? "png" : "jpg"}`;

const cut = { transitionIn: "cut" };
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...cut, ...extra });
const pull = (asset, extra = {}) => cover(asset, { treatment: "slowPull", ...extra });
const cap = (asset, title, sub, kicker, extra = {}) => cover(asset, { title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), ...extra });
const grid = (assets, extra = {}) => ({ type: "grid", assets, columns: Math.min(assets.length, 7), ...cut, ...extra });
const fan = (assets, extra = {}) => ({ type: "fan", assets, ...cut, ...extra });
const pair = (a, la, b, lb, extra = {}) => ({ type: "pair", assets: [{ asset: a, label: la }, { asset: b, label: lb }], ...cut, ...extra });
const size = (asset) => SIZES[asset] ?? [1000, 1500];
// Whole panels on a gentle push, no zoom targets; captioned with their book where it isn't the one being discussed.
const p = (asset, extra = {}) => ({ type: "panel", asset, size: size(asset), treatment: "slowPush", maxUpscale: 2, ...cut, ...extra });
const pp = (asset, title, sub, kicker, extra = {}) => p(asset, title ? { title, ...(sub ? { sub } : {}), ...(kicker ? { kicker } : {}), ...extra } : { kicker: kicker ?? sub, ...extra });
const turn = (asset, deg, extra = {}) => ({ type: "rotatePage", asset, size: size(asset), deg, ...cut, ...extra });
const site = (asset, x, y, zoom, title, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment: "push", focus: { x, y }, zoom, centerFocus: true, ...(title ? { title } : {}), ...cut, ...extra });

// Camera: { cam: "cam1-tamu" } starts at the clip's own program time; a later
// return to the same clip anchors on a phrase, and clipAt is filled in below.
const CAM = Object.fromEntries(plan.cams.map((k) => [k.clip, k]));
const cam = (clip, extra = {}) => ({ type: "camera", asset: `camera/${clip}.mp4`, clip, ...cut, ...extra });
const B500 = "Batman #500 · 1993";
const SOURCE_B5 = "Batman #5 · 2012 · Snyder and Capullo";

// [anchor phrase | { cam: clip } , segment]
const CUES = [
  // ── 01 Cold open ──────────────────────────────────────────────────────────
  [{ cam: "cam1-tamu" }, cam("cam1-tamu", { transitionIn: "fade", fadeIn: 12 })],
  ["Who some of Bruce Wayne's friends traditionally become", pp(A.absEddie, undefined, "Absolute Batman")],
  ["how Alfred's relationship with Bruce", p(A.absAlfred)],
  ["the history behind Bane", p(A.breakYou)],
  ["And some of that was news to him", cam("cam1-tamu")],
  ["The funny thing is Tomu and I came to Batman", cover(C.a1)],
  ["From Frank Miller", cover(C.dkr1)],
  ["to Michael Keaton", p(A.poster)],
  ["Azrael the Court", cover(C.b500)],
  ["the Court of Owls", cover(C.n1)],
  ["and finally absolute Batman", p(A.absTextless)],
  ["Because apparently no matter how many times", fan(ERAS)],

  // ── 02 The Batman before my Batman ────────────────────────────────────────
  ["Let's start in 1986", cap(C.dkr1, "The Dark Knight Returns #1", "1986 · Frank Miller")],
  ["And it's one of those comics", p(A.dkr1)],
  ["Four issues", grid(DKR, { title: "The Dark Knight Returns #1 to #4 · 1986" })],
  ["An older Bruce Wayne retired for 10 years", cover(C.dkr2)],
  ["He's not exactly returning to a hero's welcome", cover(C.dkr3)],
  ["Gotham's overrun with crime", pull(C.dkr2)],
  ["and eventually Batman winds up fighting Superman", cover(C.dkr4)],
  ["wearing armor naturally", p(A.dkr4)],
  [{ cam: "cam2-dkr" }, cam("cam2-dkr")],
  ["I've seen the artwork", cover(C.dkr1)],
  ["But I only just bought it", cam("cam2-dkr")],
  ["What interests me is how much of its influence", pull(C.dkr1)],
  ["The older bulkier Batman", cover(C.dkr2)],
  ["the grimmer approach", cover(C.dkr3)],
  ["that image of Batman standing against Superman", p(A.dkr4)],
  ["It's become part of the character's visual language", pp(A.absMiller, "Absolute Batman #1", "2024 · Frank Miller and Jock variant")],
  ["changes the formula", grid([C.dkr1, C.b497, C.n1, C.a1])],
  ["parts of it become familiar to the next generation", p(A.absTextless)],
  ["They might not even know where it started", pull(C.dkr1)],
  ["Which brings us to my childhood", p(A.poster)],

  // ── 03 Christmas in Gotham ────────────────────────────────────────────────
  ["I grew up in Chicagoland", grid([C.brAdapt, C.adv1, C.b497])],
  ["We have the Tim Burton movies", pp(A.poster, "Batman Returns", "1992")],
  ["the animated series", cap(C.adv1, "The Batman Adventures #1", "1992 · the animated series comic")],
  ["the toys the video games", p(A.snes)],
  ["Batman was everywhere", p(A.segaCd)],
  ["I remember getting a Batman Returns movie book", p(A.poster)],
  ["It had all this behind the scenes material", p(A.brComic)],
  ["I love the way Gotham looked", cover(C.brAdapt)],
  ["Burton's version was dark weird", p(A.poster)],
  ["There was Danny DeVito's Penguin", p(A.segaCd)],
  ["Michelle Pfeiffer's Catwoman", p(A.poster)],
  ["And I love the Batman Returns game on Super Nintendo", pp(A.snes, "Batman Returns", "Super Nintendo · Konami · 1993")],
  ["which was perfect because the penguin", cover(C.brAdapt)],
  ["You just walked around Gotham", p(A.snes)],
  ["And of course there was Batman the Animated Series", cover(C.adv1)],
  ["Kevin Conroy's Batman", pull(C.adv1)],
  ["So for me Batman wasn't initially about knowing", grid([C.dkr1, C.b492, C.soa1, C.b497, C.b500])],
  ["It was the movies the cartoon", pair(A.poster, "1992", C.adv1, "1992")],
  ["and then all this cool looking stuff", cover(C.b500)],
  ["And one character in particular", cover(C.soa1)],

  // ── 04 The Batman I couldn't stop drawing ─────────────────────────────────
  [{ cam: "cam3-azrael" }, cam("cam3-azrael")],
  ["I drew the guy constantly", pp(A.azOriginal, "Azrael", "his own costume first")],
  ["that ridiculous armored Batman suit", pp(A.azbatsDescent, "Azrael as Batman", B500)],
  ["And the funny thing is I really wasn't following", cam("cam3-azrael")],
  ["But look at this thing", p(A.azbatsManley)],
  ["Everything in the mid 90s had armor", p(A.azGauntlets)],
  ["And some of these guys looked like getting dressed", p(A.azbatsClaws)],
  ["Now knowing the actual story", grid(SOA, { title: "Batman: Sword of Azrael #1 to #4 · 1992 to 1993" })],
  ["John Paul Valley is introduced in Sword of Azrael", cap(C.soa1, "Batman: Sword of Azrael #1", "1992 · Dennis O'Neil and Joe Quesada")],
  ["He's been conditioned by the Order", p(A.azSwords)],
  ["Then during Nightfall in 1993", cap(C.b492, "Batman #492", "1993 · Knightfall begins")],
  ["Bane comes along with a pretty clever plan", p(A.bane)],
  ["He releases Arkham's inmates", pull(C.b492)],
  ["Batman is exhausted", cover(C.b498)],
  ["Bane breaks his back", p(A.breakYou)],
  ["Batman number 497", cap(C.b497, "Batman #497", "1993")],
  ["And John Paul Valley eventually takes over", cap(C.b500, "Batman #500", "1993")],
  ["He starts doing things differently", p(A.azbatsDescent)],
  ["More weapons more armor", p(A.azbatsClaws)],
  ["Bruce's replacement turns out to be", p(A.azbatsRed)],
  ["Which is interesting because as a kid", p(A.azbatsManley)],
  ["I'm not entirely sure I've changed my mind", pull(C.b500)],
  ["Something else about this whole period", cover(C.wosm118)],
  ["You had Ben Reilly the Scarlet Spider", pp(A.benCard, "Ben Reilly", "Marvel Masterpieces card · 1995")],
  ["and the Clone Saga", cover(C.sens0)],
  ["Batman gets replaced", pair(C.b500, "1993", A.benSpidey, "Spider-Man #67 · 1996")],
  ["It felt like the 90s superhero industry", grid([C.b492, C.b497, C.b500, C.wosm118, C.sens0])],
  ["Sometimes those decisions worked", cover(C.b500)],
  ["Sometimes you got storylines", p(A.benSpidey)],
  ["But for a kid who loved drawing superheroes", p(A.azOriginal)],
  ["And what's funny is that eventually those designs", p(A.azbatsStorm)],
  ["You look back at the armored Batman", p(A.azbatsDescent)],
  ["Sometimes the imagery grabs you first", pull(C.b500)],

  // ── 05 The New 52 ─────────────────────────────────────────────────────────
  ["Fast forward to 2011", cap(C.n1, "Batman #1", "2011")],
  ["DC launches the new 52", p(A.n52Textless)],
  ["and Scott Snyder and Greg Capullo take over Batman", grid(NEW52, { title: "Batman #1 to #7 · 2011 to 2012 · Snyder and Capullo" })],
  [{ cam: "cam4-owls" }, cam("cam4-owls")],
  ["Gotham had a secret society", p(A.owls)],
  ["Here's Batman supposedly the world's greatest detective", cam("cam4-owls")],
  ["By this point Batman had already fought everybody", p(A.villains)],
  ["Ra's al Ghul the list goes on forever", pull(C.n1)],
  ["So you make them part of the city's history", p(A.owlsTower)],
  ["You make them older than Batman", pp(A.owlsWest, undefined, "All-Star Western #9 · 2012 · the Court in the 1880s")],
  ["You make them something that's been there all along", p(PG(3))],
  ["And Capullo's artwork is fantastic", p(A.talon)],
  ["There's a sequence in Batman number five", pp(A.mazeCover, "Batman #5", "on sale January 2012 · variant cover")],
  ["trapped in this labyrinth", pp(PG(4), undefined, SOURCE_B5)],
  ["and the pages actually start changing orientation", p(PG(6))],
  // Turn the sideways page clockwise until it reads upright (direction checked against its captions).
  ["You have to turn the comic to read it", turn(PG(7), 90, { turnAt: 0.18 })],
  ["It's something that works specifically", p(PG(14))],
  ["But what I especially appreciate", p(A.owls)],
  ["not just another bad guy", p(A.talon)],
  ["An entire piece of Gotham's history", p(PG(1))],
  ["And now we jump ahead to 2024", cap(C.a1, "Absolute Batman #1", "2024")],
  ["when Snyder comes back", p(A.absTextless)],

  // ── 06 Everything old is new again ────────────────────────────────────────
  ["So let's talk about Absolute Batman", cover(C.a1)],
  ["Scott Snyder comes back this time with Nick", cap(C.a2, "Absolute Batman", "Scott Snyder and Nick Dragotta")],
  ["enormous working class Batman", p(A.absTextless)],
  ["No Inherited Billions", cover(C.a3)],
  ["no Alfred raising Bruce", cover(C.a4)],
  ["built like somebody fed a refrigerator steroids", p(A.absTextless, { treatment: "slowPull" })],
  [{ cam: "cam5-absolute" }, cam("cam5-absolute")],
  ["Bruce's childhood friends include Edward", pp(A.absEddie, "Edward Nygma", "Absolute Batman")],
  ["Harvey Dent", pp(A.absDent, "Harvey Dent", "Absolute Batman #21 · cover")],
  ["Oswald Cobblepot", pp(A.absOzzie, "Oswald Cobblepot", "Absolute Batman #21 · variant cover")],
  ["Waylon Jones", pp(A.absWaylon, "Waylon Jones", "Absolute Batman #12 · cover")],
  ["If you've been reading Batman for a while", cam("cam5-absolute")],
  ["Riddler Two Face Penguin Killer Croc", grid([A.villains, A.twoFace, A.penguin, A.croc], { title: "Riddler · Two-Face · Penguin · Killer Croc" })],
  ["traditionally winds up fighting", p(A.villains)],
  ["The characters are familiar", cover(C.a5)],
  ["You're recognizing the ingredients", cover(C.a6)],
  ["And then there's Alfred", pair(A.alfred, "Alfred, the butler", A.absAlfred, "Absolute Alfred")],
  ["sleep deprivation and being punched", p(A.alfred)],
  ["He's been there since Bruce was a kid", p(A.family)],
  ["Alfred's an intelligence operative", pp(A.absAlfred, "Alfred Pennyworth", "Absolute Batman")],
  ["That's a massive change", pair(A.alfred, "Before", A.absAlfred, "Absolute")],
  ["And you've got Black Mask", p(A.blackMask)],
  ["Roman Sianis another established Gotham villain", pp(A.absSionis, "Roman Sionis", "Absolute Batman")],
  ["And Bane is another good example", p(A.bane)],
  ["you probably know him as the guy who broke Batman's back", p(A.breakYou)],
  ["But knowing what happened during Nightfall", cover(C.b497)],
  ["led to Azrael taking over as Batman", cover(C.b500)],
  ["gives you a lot more history", grid(ABS, { title: "Absolute Batman #1 to #6 · 2024 to 2025" })],
  ["You don't have to know any of this", p(A.absTextless)],
  ["but when you do there are these little connections", pair(C.b497, "1993", C.a1, "2024")],
  ["That's what was fun about talking with", cover(C.a1)],
  ["Not because he needed me to explain", cover(C.a2)],
  ["It was more that I had decades", grid([C.dkr1, C.b492, C.b497, C.b500, C.soa1, C.n1])],
  ["It's a rare and beautiful thing", p(A.villains)],
  ["It reminds me a little of what I love about Jonathan Hickman's", cap(C.hox, "House of X #1", "2019 · Jonathan Hickman")],
  ["With House and Powers", pair(C.hox, "House of X #1", C.pox, "Powers of X #1")],
  ["Hickman clearly knew the history", cover(C.pox)],
  ["He didn't just throw everything out", pull(C.hox)],
  ["He took familiar relationships", pair(C.hox, "2019", C.a1, "2024")],
  ["That's something I really appreciate as a reader", fan(ERAS)],
  ["When a writer rewards you", grid(ABS)],
  ["and I love that after all these decades", p(A.absTextless, { treatment: "slowPull" })],

  // ── 07 Closing ────────────────────────────────────────────────────────────
  ["Little kids love Batman", cover(C.adv1)],
  ["You've got the costume the cape", p(A.poster)],
  ["the Batmobile the gadgets", p(A.segaCd)],
  ["He's cool before you even know anything", pull(C.adv1)],
  ["And then you start getting into the comics", grid([C.dkr1, C.adv1, C.b497, C.b500, C.n1, C.n5, C.a1])],
  ["Dozens of writers and artists", fan(ERAS)],
  ["different Robins", p(A.family)],
  ["different interpretations of the villains", p(A.villains)],
  ["You could spend years reading Batman comics", grid([C.dkr1, C.dkr4, C.b492, C.b497, C.b500, C.soa1, C.n1, C.n5, C.a1, C.a2])],
  ["And sometimes you discover that a character", p(A.dkr1)],
  ["Which is why I finally bought The Dark Knight Returns", cap(C.dkr1, "The Dark Knight Returns", "1986")],
  ["Forty years late", p(A.dkr4)],
  [{ cam: "cam6a-close" }, cam("cam6a-close")],
  ["the kid who used to draw Azrael", p(A.azbatsManley)],
  ["can still get excited about Absolute Batman", p(A.absTextless)],
  ["If you're collecting any of these books", site("cc-search-absolute", 0.5, 0.35, 1.15)],
  ["a comic book database and collection tracker", site("cc-absolute-series", 0.45, 0.3, 1.2)],
  ["keep track of what you own", site("cc-absolute-series", 0.55, 0.47, 1.6)],
  ["You can check it out at", site("cc-home", 0.5, 0.3, 1.05, "comixcatalog.com")],
  [{ cam: "cam6b-signoff" }, cam("cam6b-signoff")],
];

const anchorIdx = CUES.map((cue, i) => (typeof cue[0] === "string" ? i : -1)).filter((i) => i >= 0);
const resolved = resolveAnchors(narrationWords, anchorIdx.map((i) => CUES[i][0]));
export const anchorMisses = resolved.misses.map((m) => ({ ...m, phrase: CUES[anchorIdx[m.index]][0] }));
if (anchorMisses.length) throw new Error(`episode-007: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const timeOf = new Map(anchorIdx.map((ci, k) => [ci, resolved.times[k]]));

const segments = CUES.map(([anchor, seg], i) => {
  const at = typeof anchor === "string" ? +Math.max(0, timeOf.get(i) - LEAD).toFixed(3) : CAM[anchor.cam].at;
  const out = { ...seg, at, beat: typeof anchor === "string" ? anchor : `camera ${anchor.cam}` };
  if (seg.type === "camera") {
    out.clipAt = +Math.max(0, at - CAM[seg.clip].at).toFixed(3);
    delete out.clip;
  }
  return out;
});
// 2026-11-15 Tony: the hard cut into the card was jarring, so it fades up from the dip instead.
segments.push({ type: "sting", at: plan.sting.at, beat: "Channel sting", transitionOut: "cut", fadeIn: 8, tagline: "Catalog. Collect. Connect." });
segments.push({ type: "end", at: plan.endCard, dur: plan.duration - plan.endCard, beat: "End card", title: "Which Batman got you into the character?", sub: "Tell me in the comments", transitionIn: "cut" });
segments.sort((x, y) => x.at - y.at);

export default {
  id: "episode-007", assetEpisodeId: "episode-007", outputDir: "episode-007", outputName: "episode-007", compositionId: "Episode007",
  title: "Every Generation Has Its Own Batman", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/VOICE_PROGRAM.wav", at: 0, volume: 1 },
    // Double Drift (Ep 006's bed, stored 6 dB down); Tony's real read is less dense than TTS, so 0.4 as in 006.
    music: { asset: "audio/MUSIC_BED_DOUBLE_DRIFT.wav", volume: 0.4, fadeIn: 2, fadeOut: 4, loop: false, duck: [{ from: plan.sting.at + 0.35, to: plan.sting.at + plan.sting.dur }] },
    // Bed hands off under the sting (no silent hole before it), sting eases in 3 dB lower.
    sting: { asset: "audio/MUSIC_STING.mp3", at: plan.sting.at, from: 7.1, dur: plan.sting.dur, volume: 0.7, fadeIn: 0.15, fadeOut: 0.4 },
  },
};
