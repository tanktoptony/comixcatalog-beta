// Episode 007's three standalone Shorts on one clock (build_shorts_audio.py):
// Tony's own reads of Azrael, the Court of Owls and Absolute Batman's
// friends-as-villains. ShortClip (src/Shorts.jsx) cuts each out by beat and
// frames every shot full-bleed and vertical; the Batman #5 page still turns.
// Same art as the episode (timeline.js); no text cards.

import words from "./shorts.words.js";
import plan from "./shorts-plan.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";
import SIZES from "./sizes.js";

export const shortsWords = words.words;

// Caption spellings (anchors keep Whisper's words): Jean-Paul Valley, Nygma,
// and "Comics Catalog" as one word, ComixCatalog.
export const shortsCaptionWords = (() => {
  const out = [];
  for (let i = 0; i < shortsWords.length; i++) {
    const w = shortsWords[i];
    const next = shortsWords[i + 1];
    const punct = (x) => (x.match(/[.,!?;:]+$/) ?? [""])[0];
    if (w.w === "Comics" && next && /^Catalog/.test(next.w)) {
      out.push({ ...w, w: "ComixCatalog" + punct(next.w), e: next.e });
      i++;
    } else if (w.w === "John" && next?.w.startsWith("Paul")) out.push({ ...w, w: "Jean" });
    else if (w.w.startsWith("Paul") && shortsWords[i - 1]?.w === "John") out.push({ ...w, w: "-" + w.w });
    else if (/^Valli/.test(w.w)) out.push({ ...w, w: "Valley" + punct(w.w) });
    else if (/^Nigma/.test(w.w)) out.push({ ...w, w: "Nygma" + punct(w.w) });
    else out.push(w);
  }
  return out;
})();

const c = (n) => `covers/${n}.jpg`;
const C = {
  b492: c("batman-492-1993"), b497: c("batman-497-1993"), b500: "covers/alt/batman-500-1993-alt-a.jpg", soa1: c("sword-of-azrael-001-1992"),
  dkr1: c("dark-knight-returns-001-1986"),
  n1: c("batman-2011-001-2011"), n2: c("batman-2011-002-2011"), n3: c("batman-2011-003-2012"), n4: c("batman-2011-004-2012"),
  n5: c("batman-2011-005-2012"), n6: c("batman-2011-006-2012"), n7: c("batman-2011-007-2012"),
  a1: c("absolute-batman-001-2024"), a2: c("absolute-batman-002-2025"), a3: c("absolute-batman-003-2025"),
  a4: c("absolute-batman-004-2025"), a5: c("absolute-batman-005-2025"), a6: c("absolute-batman-006-2025"),
};
const A = {
  azOriginal: "art/azrael-gallery/Azrael_Jean-Paul_Valley_0018.jpg",
  azSwords: "art/azrael-gallery/Azrael_Jean-Paul_Valley_0003.jpg",
  azHood: "art/azrael-gallery/Azrael_Jean-Paul_Valley_0002.jpg",
  azbatsDescent: "art/batman-500/Batman_Jean-Paul_Valley_0011.jpg",
  azbatsManley: "art/azrael-gallery/Batman_Jean-Paul_Valley_0014.jpg",
  azbatsStorm: "art/azrael-gallery/Batman_Jean-Paul_Valley_0001.jpg",
  azbatsClaws: "art/azrael-gallery/Batman_Jean-Paul_Valley_0027.jpg",
  azbatsRed: "art/azrael-gallery/Batman_Jean-Paul_Valley_0006.jpg",
  breakYou: "art/batman-497/Bane_0020.jpg",
  owls: "art/court-of-owls/Court_of_Owls_008.jpg",
  owlsTower: "art/court-of-owls/Court_of_Owls_006.jpg",
  owlsWest: "art/court-of-owls/All-Star_Western_Vol_3_9_Textless.jpg",
  talon: "art/court-of-owls/Talon_007.jpg",
  mazeCover: "art/batman-2011-5/Batman_Vol_2_5_Alternate.jpg",
  n52Textless: "art/batman-2011-1/Batman_Vol_2_1_Textless.jpg",
  absTextless: "art/absolute-batman-1/Absolute_Batman_Vol_1_1_Textless.jpg",
  absEddie: "art/absolute-nygma/Eddie_Absolute_Universe_004.jpg",
  absDent: "art/absolute-dent/Absolute_Batman_Vol_1_21_Textless.jpg",
  absOzzie: "art/absolute-cobblepot/Absolute_Batman_Vol_1_21_Textless_Dragotta_Variant.jpg",
  absWaylon: "art/absolute-jones/Absolute_Batman_Vol_1_12_Textless.jpg",
  absAlfred: "art/absolute-alfred/Alfred_Pennyworth_Absolute_Universe_0002.png",
  villains: "art/classic-penguin/Batman_Villains_0003.jpg",
  twoFace: "art/classic-two-face/Two-Face_0002.jpg",
  penguin: "art/classic-penguin/Penguin_0001.jpg",
  croc: "art/classic-killer-croc/Killer_Croc_0002.jpg",
  alfred: "art/classic-alfred/Alfred_Pennyworth_0001.jpg",
  family: "art/absolute-alfred/Batman_Family_0001.jpg",
};
const PG = (n) => `art/batman-2011-5-pages/page-${n}.${n === 12 ? "png" : "jpg"}`;

const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", transitionIn: "cut", ...extra });
const pull = (asset, extra = {}) => cover(asset, { treatment: "slowPull", ...extra });
const cycle = (assets, extra = {}) => ({ type: "grid", assets, columns: assets.length, transitionIn: "cut", ...extra });
const turn = (asset, extra = {}) => ({ type: "rotatePage", asset, size: SIZES[asset], deg: 90, turnAt: 0.2, transitionIn: "cut", ...extra });
const site = (name, extra = {}) => cover(`screens/${name}.png`, extra);

const CUES = [
  // Short 1 · Batman got replaced in the 90s
  ["Batman got replaced in the 90s", cover(C.b500)],
  ["When I was a kid in the 90s", cover(A.azbatsDescent)],
  ["this insane suit of armor", cover(A.azbatsClaws)],
  ["I drew this thing constantly", cover(A.azbatsManley)],
  ["but I didn't actually understand the entire story", pull(C.b492)],
  ["This is John Paul Valli", cover(A.azHood, { title: "Jean-Paul Valley" })],
  ["better known as Azrael", cover(C.soa1, { title: "Sword of Azrael #1 · 1992" })],
  ["and in 1993 after Bane broke", cover(A.breakYou)],
  ["during Nightfall", cover(C.b497, { title: "Batman #497 · 1993" })],
  ["John Paul eventually took over as Batman", cover(C.b500, { title: "Batman #500 · 1993" })],
  ["He already had this awesome costume of his own", cover(A.azOriginal)],
  ["with all the blades and armor", cover(A.azSwords)],
  ["Then he became Batman and started adding", cover(A.azbatsStorm)],
  ["made him a pretty terrible Batman", cover(A.azbatsRed)],
  ["He was increasingly brutal", cover(A.azbatsClaws)],
  ["But I was a kid", cover(A.azbatsManley)],
  ["I was drawing the suit", cover(A.azOriginal)],
  ["And honestly 30 years later", cover(A.azbatsDescent, { treatment: "slowPull" })],
  ["I'm Tony from Comics Catalog tell me", pull(C.b500)],

  // Short 2 · Batman didn't know his own city
  ["Batman didn't know his own city", cover(C.n1)],
  ["Batman is supposed to know everything", cover(A.n52Textless)],
  ["Every rooftop every alley", cover(PG(1))],
  ["So what happens when he discovers a secret society", cover(A.owls)],
  ["for centuries", cover(A.owlsWest)],
  ["That's the idea behind the Court of Owls", cover(C.n2, { title: "Batman #2 · 2011" })],
  ["Scott Snyder and Greg Capullo's Batman run", cover(C.n3, { title: "Snyder and Capullo" })],
  ["I was reading it when it launched", cover(C.n4)],
  ["Instead of giving Batman one more villain", cover(A.talon)],
  ["Snyder invents an entire organization", cover(A.owlsTower)],
  ["And there's this fantastic sequence in Batman number five", cover(A.mazeCover, { title: "Batman #5 · 2012" })],
  ["trapped in a labyrinth", cover(PG(4))],
  ["Capullo actually starts rotating the artwork", cover(PG(6))],
  ["You have to turn the comic to follow it", turn(PG(7))],
  ["That's the kind of stuff I love about comics", cover(PG(14))],
  ["It's doing something with the medium itself", cover(C.n5)],
  ["years of Batman comics", cycle([C.dkr1, C.b500, C.n1, C.a1])],
  ["these guys still found a way", cover(A.owls, { treatment: "slowPull" })],
  ["I'm Tony from Comics Catalog If you haven't read", cover(C.n6)],
  ["put it on your list", cover(C.n1, { title: "Court of Owls · Batman #1 to #7" })],

  // Short 3 · Bruce Wayne's friends are his enemies
  ["Bruce Wayne's friends are his enemies", cover(C.a1)],
  ["One of my favorite things about Absolute Batman", cover(A.absTextless)],
  ["has rearranged the entire Batman universe", cover(C.a2)],
  ["Look at Bruce Wayne's childhood friends", cover(C.a3)],
  ["Edward Nigma", cover(A.absEddie, { title: "Edward Nygma" })],
  ["Harvey Dent", cover(A.absDent, { title: "Harvey Dent" })],
  ["Oswald Cobblepot", cover(A.absOzzie, { title: "Oswald Cobblepot" })],
  ["Waylon Jones", cover(A.absWaylon, { title: "Waylon Jones" })],
  ["If you've been reading Batman comics for years", cover(C.a4)],
  ["Riddler", cover(A.villains, { title: "Riddler" })],
  ["Two Face", cover(A.twoFace, { title: "Two-Face" })],
  ["Penguin", cover(A.penguin, { title: "Penguin" })],
  ["Killer Croc", cover(A.croc, { title: "Killer Croc" })],
  ["Four of Batman's established enemies", cover(A.villains, { treatment: "slowPull" })],
  ["Except in Absolute Batman these guys grew up", cover(C.a5)],
  ["They're his friends", cover(A.absEddie)],
  ["decades of comic book history", cycle([C.dkr1, C.b497, C.n1, C.a1])],
  ["Even Alfred's relationship with Bruce", cover(A.alfred)],
  ["has been completely reworked", cover(A.absAlfred)],
  ["I was talking about this stuff", cover(C.a6)],
  ["We were both reading the series", pull(A.absTextless)],
  ["he didn't know some of the older lore", cover(A.family)],
  ["You can enjoy Absolute Batman without knowing", cover(C.a2)],
  ["there are all these little connections", cycle([C.b497, C.a1])],
  ["I'm Tony from Comics Catalog and this is exactly", site("cc-absolute-series", { position: "30% 50%" })],
  ["keeps me reading comics", pull(C.a1)],
];

const resolved = resolveAnchors(shortsWords, CUES.map(([p]) => p));
if (resolved.misses.length) throw new Error(`episode-007 shorts: unresolved anchors:\n${resolved.misses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, resolved.times[i] - 0.1).toFixed(3), beat: phrase }));
// A blank marker closes each Short; each Short's first cue gets a stable beat name for shorts.js.
segments[0].at = 0;
plan.shorts.forEach((s) => segments.push({ type: "chapter", title: "", at: +(s.end + 0.2).toFixed(3), beat: `Short ${s.short} end` }));
segments.sort((a, b) => a.at - b.at);
plan.shorts.forEach((s) => { segments.find((x) => x.at >= s.at - 0.6 && !x.beat.startsWith("Short ")).beat = `Short ${s.short} start`; });

export default {
  id: "episode-007-shorts", assetEpisodeId: "episode-007", outputDir: "episode-007", outputName: "episode-007-shorts", compositionId: "Episode007Shorts",
  title: "Episode 007 Shorts", duration: plan.duration, nudges: [], segments,
  audio: {
    narration: { asset: "audio/SHORTS_VOICE.wav", at: 0, volume: 1 },
    music: { asset: "audio/SHORTS_MUSIC.wav", volume: 1, fadeIn: 0, fadeOut: 0, loop: false },
  },
};
