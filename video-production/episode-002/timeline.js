// Episode 002: Jonathan Hickman's Comics You Might Have Missed.
// Voice-over only (Tony's call, 2026-10-09): no on-camera shots, and no
// B-roll yet, so every visual is a real cover, a sourced interior, or a card.
//
// Every shot is anchored to the phrase it illustrates (shared/anchors.js
// finds it in narration.words.js). Order must follow the narration.
// Prefer plain words over proper nouns in anchors.

import words from "./narration.words.js";
import narrationEdit from "./narration.edit.js";
import { resolveAnchors } from "../shared/anchors.js";
import { applyEdit } from "../shared/narrationEdit.js";

const editApplies = narrationEdit?.source === words.source;
// The edit is pre-rendered sample-accurately (8 ms fades at each splice) to
// NARRATION_EDITED.wav, so the voice plays as one file in edited time.
const NARRATION = editApplies ? "audio/NARRATION_EDITED.wav" : `audio/${words.source}`;
const edited = applyEdit(words, editApplies ? narrationEdit : null);
export const narrationWords = edited.words;
const VOICE_AT = 0.8;
const LEAD = 0.12;

const c = (name) => `covers/${name}.jpg`;
const i = (name) => `interiors/${name}`;
const C = {
  ff570: c("fantastic-four-570-1998"), na1: c("new-avengers-001-2013"),
  sw1: c("secret-wars-001-2015"), sw9: c("secret-wars-009-2015"),
  hox1: c("house-of-x-001-2019"), hox2: c("house-of-x-002-2019"), pox1: c("powers-of-x-001-2019"),
  mp: (n) => c(`the-manhattan-projects-${String(n).padStart(3, "0")}-2012`),
  mpSun: c("manhattan-projects-sun-beyond-the-stars-001-2015"), mpTpb: c("manhattan-projects-tpb-001-2012"),
  eow: (n) => c(`east-of-west-${String(n).padStart(3, "0")}-2013`), eowTpb: c("east-of-west-tpb-001-2013"),
  nn1: c("the-nightly-news-001-2007"), nn2: c("the-nightly-news-002-2007"),
  pax1: c("pax-romana-001-2007"), pax2: c("pax-romana-002-2007"),
  bmm1: c("the-black-monday-murders-001-2016"), bmm2: c("the-black-monday-murders-002-2016"), bmm5: c("the-black-monday-murders-005-2016"),
  trans: c("transhuman-001-2008"), redMass: c("a-red-mass-for-mars-001-2008"), redWing: c("the-red-wing-001-2011"), decorum: c("decorum-001-2020"),
};
const P = {
  einstein: { asset: i("mp-einstein-gateway-panel.jpg"), size: [1170, 432] },
  groves: { asset: i("mp-001-groves-panel.jpg"), size: [576, 190] },
  feynman: { asset: i("mp-feynman-face-panel.jpg"), size: [576, 317] },
  vonBraun: { asset: i("mp-von-braun-arm-panel.jpg"), size: [584, 254] },
  torii: { asset: i("mp-001-torii-gate-battle.jpg"), size: [584, 636] },
  fermi: { asset: i("mp-fermi-einstein-faces.jpg"), size: [400, 737] },
  death: { asset: i("eow-death-in-white-panel.png"), size: [957, 591] },
  eowDesign: { asset: i("eow-design-page-how-things-were.png"), size: [750, 350] },
  chosen: { asset: i("eow-the-chosen-table.png"), size: [943, 597] },
  pax1: { asset: i("pax-romana-001-p01-constantinople.jpg"), size: [741, 1154] },
  pax3: { asset: i("pax-romana-001-p03-hidden-records.jpg"), size: [741, 1154] },
  pax4: { asset: i("pax-romana-001-p04-vatican-archives.jpg"), size: [741, 1154] },
};
const MARVEL = [C.ff570, C.na1, C.sw1, C.hox1, C.pox1];
const MP_EOW = [C.eow(1), C.mp(1), C.eow(2), C.mp(2), C.eow(3), C.mp(3), C.eow(4), C.mp(4)];
const CREATOR_OWNED = [C.nn1, C.pax1, C.trans, C.redMass, C.redWing, C.mp(1), C.eow(1), C.bmm1, C.decorum];
const EOW_RUN = [1, 2, 3, 4, 5, 6, 10, 15, 20, 30, 40, 45].map(C.eow);
const panel = (p, extra = {}) => ({ type: "panel", ...p, ...extra });
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...extra });

const CUES = [
  // ── 01 Cold open ───────────────────────────────────────────────────────
  ["following Marvel comics for the last decade", { type: "grid", assets: MARVEL, columns: 5, push: 0.03 }],
  ["Fantastic Four", cover(C.ff570, { transitionIn: "cut", treatment: "still" })],
  ["Secret Wars House of X", cover(C.sw1, { transitionIn: "cut", treatment: "still" })],
  ["House of X Powers of X", cover(C.hox1, { transitionIn: "cut", treatment: "still" })],
  ["Powers of X", cover(C.pox1, { transitionIn: "cut", treatment: "still" })],

  // ── 02 Intro ───────────────────────────────────────────────────────────
  ["This guy has written some of the biggest", { type: "grid", assets: MARVEL, columns: 5, push: 0.02, transitionIn: "cut" }],
  ["But here's something funny", { type: "chapter", title: "But here's something funny." }],
  ["I've been collecting comics for most of my life", { type: "grid", assets: MP_EOW, columns: 4, push: 0.03 }],
  ["I loved the covers", cover(C.eow(1), { transitionIn: "cut" })],
  ["sparse mysterious", cover(C.mp(3), { treatment: "slowPull" })],
  ["completely nuts", panel(P.einstein, { transitionIn: "cut" })],
  ["Garbage Pail Kids", panel(P.groves)],
  ["I hadn't connected those books", { type: "pair", assets: [{ asset: C.mp(1), label: "The Manhattan Projects" }, { asset: C.eow(1), label: "East of West" }], title: "Jonathan Hickman. Both of them." }],
  ["So that got me thinking", { type: "grid", assets: CREATOR_OWNED, columns: 5, push: 0.02 }],
  ["what he did with the X-Men", { type: "pair", assets: [{ asset: C.hox1, label: "House of X" }, { asset: C.sw1, label: "Secret Wars" }] }],
  ["And that's what I want to talk about today", { type: "title", kicker: "ComixCatalog · Episode 002", title: "The Other\nJonathan Hickman", sub: "Creator-owned comics you might have missed", assets: CREATOR_OWNED, wall: 0.45 }],

  // ── 03 The Marvel guy ──────────────────────────────────────────────────
  ["the Marvel side", { type: "chapter", kicker: "Part one", title: "The Marvel guy", transitionIn: "cut" }],
  ["took over Fantastic Four in 2009", cover(C.ff570, { title: "Fantastic Four · 2009" })],
  ["Not issues Years", { type: "quote", text: "Not issues. Years." }],
  ["Avengers and New Avengers at the same time", cover(C.na1, { treatment: "panDown", title: "New Avengers · 2013" })],
  ["introduced something called incursions", { type: "quote", text: "INCURSION: two universes collide. Earth is the point of impact." }],
  ["It does not go great", cover(C.na1, { treatment: "focus", focus: { x: 0.5, y: 0.45, zoom: 1.5 } })],
  ["building to Secret Wars in 2015", cover(C.sw1, { treatment: "panDown", title: "Secret Wars · 2015", transitionIn: "cut" })],
  ["Doctor Doom", cover(C.sw9, { treatment: "slowPush" })],
  ["I loved Secret Wars", { type: "fan", assets: [C.sw1, C.sw9, C.na1] }],
  ["came to the X-Men with House of X", { type: "pair", assets: [{ asset: C.hox1, label: "House of X" }, { asset: C.pox1, label: "Powers of X" }], transitionIn: "cut" }],
  ["one issue a week for twelve weeks", { type: "quote", text: "12 issues. 12 weeks. 2019." }],
  ["has the Moira MacTaggert reveal", cover(C.hox2, { treatment: "still", title: "House of X #2" })],
  ["I was blown away", cover(C.hox2, { treatment: "slowPush" })],
  ["That's what gets me about Hickman", { type: "grid", assets: [C.ff570, C.na1, C.sw1, C.sw9, C.hox1, C.hox2, C.pox1], columns: 4, push: 0.02 }],
  ["the movies noticed", { type: "quote", text: "“Incursion”\nDoctor Strange in the Multiverse of Madness (2022)" }],
  ["The next two Avengers movies", { type: "quote", text: "Avengers: Doomsday · December 2026\nAvengers: Secret Wars · December 2027" }],
  ["back in 1984", { type: "quote", text: "Secret Wars (1984)\nlong before Hickman" }],
  ["That's the Marvel guy", { type: "grid", assets: MP_EOW, columns: 4, push: 0.03, transitionIn: "cut" }],

  // ── 04 The Manhattan Projects ──────────────────────────────────────────
  ["Image Comics started in 2012", cover(C.mp(1), { title: "The Manhattan Projects", sub: "Hickman · Pitarra · Browne · Image, 2012", transitionIn: "cut" })],
  ["You know the real Manhattan Project", cover(C.mp(3), { treatment: "focus", focus: { x: 0.5, y: 0.2, zoom: 1.6 } })],
  ["way way weirder", panel(P.torii, { transitionIn: "cut" })],
  ["The cast is real people", cover(C.mp(20), { transitionIn: "cut" })],
  ["Wernher von Braun", panel(P.vonBraun, { transitionIn: "cut" })],
  ["who actually ran the project", panel(P.groves)],
  ["who the history books say they are", panel(P.fermi)],
  ["I won't spoil issue one", cover(C.mp(1), { treatment: "focus", focus: { x: 0.5, y: 0.35, zoom: 1.4 } })],
  ["talking Soviet space dog", cover(C.mp(6), { transitionIn: "cut" })],
  ["Franklin Roosevelt", { type: "quote", text: "FDR.\nBut an A.I." }],
  ["That's just the book", { type: "fan", assets: [C.mp(4), C.mp(5), C.mp(6)] }],
  ["And then there's the art", panel(P.einstein, { transitionIn: "cut" })],
  ["draws faces like he's mad at them", panel(P.groves, { transitionIn: "cut" })],
  ["Too many lines too many teeth", panel(P.feynman, { transitionIn: "cut" })],
  ["drawn like they came out of a wax pack", panel(P.fermi, { transitionIn: "cut" })],
  ["has said he's a big", { type: "quote", text: "Moebius · Geof Darrow\nFrank Quitely · Seth Fisher" }],
  ["This is my copy", cover(C.mp(1), { treatment: "slowPull", transitionIn: "cut" })],
  ["What stuck was the look of it", { type: "grid", assets: [1, 2, 3, 4, 5, 6, 10, 15].map(C.mp), columns: 4, push: 0.02 }],
  ["It ran 25 issues", { type: "fan", assets: [C.mp(1), C.mp(10), C.mp(15), C.mp(20), C.mp(25), C.mpSun] }],

  // ── 05 East of West ────────────────────────────────────────────────────
  ["East of West Also Image", cover(C.eow(1), { title: "East of West", sub: "Hickman · Dragotta · Martin · Wooton · Image, 2013", transitionIn: "cut" })],
  ["science fiction western", cover(C.eow(2), { treatment: "panDown" })],
  ["doesn't end in 1865", { type: "quote", text: "1865 → 1908\nA comet hits Kansas." }],
  ["splits the continent into seven nations", cover(C.eow(3), { title: "The Seven Nations of America" })],
  ["The story picks up in 2064", { type: "grid", assets: [C.eow(2), C.eow(4), C.eow(6), C.eow(15)], columns: 4, push: 0.03, title: "2064" }],
  ["Death has gone off script", panel(P.death, { transitionIn: "cut" })],
  ["The first issue will tell you", cover(C.eow(1), { treatment: "focus", focus: { x: 0.5, y: 0.3, zoom: 1.5 } })],
  ["a prophecy called the Message", cover(C.eow(10), { transitionIn: "cut" })],
  ["a hell of a group chat", { type: "quote", text: "A Confederate soldier.\nA Native American chief.\nChairman Mao." }],
  ["the Chosen", panel(P.chosen, { transitionIn: "cut" })],
  ["The tagline on this series", { type: "quote", text: "“The things that divide us are stronger than the things that unite us.”", attribution: "East of West" }],
  ["the data pages in House of X", { type: "pair", assets: [{ asset: C.hox1, label: "House of X" }, { asset: C.eow(1), label: "East of West" }], transitionIn: "cut" }],
  ["Dragotta's art keeps it moving", panel(P.death, { treatment: "slowPull" })],
  ["those covers", { type: "grid", assets: EOW_RUN, columns: 6, push: 0.02, transitionIn: "cut" }],
  ["Same confession as before", cover(C.eow(20))],
  ["East of West is finished", cover(C.eow(45), { treatment: "panUp", title: "45 issues. A real ending." })],
  ["Eisner nomination for Best Continuing Series", { type: "quote", text: "2014 Eisner nominee\nBest Continuing Series" }],
  ["Amazon announced a TV show", cover(C.eow(40))],

  // ── 06 Deep cuts ───────────────────────────────────────────────────────
  ["Those are the two I owned", { type: "grid", assets: CREATOR_OWNED, columns: 5, push: 0.02, transitionIn: "cut" }],
  ["The Nightly News 2006", cover(C.nn1, { title: "The Nightly News · 2006", transitionIn: "cut" })],
  ["Wrote it drew it colored it lettered it", { type: "quote", text: "Writer. Artist. Colorist. Letterer." }],
  ["bad news coverage", cover(C.nn2)],
  ["On his first book", cover(C.nn1, { treatment: "slowPull", title: "2008 Eisner nominee · Best Limited Series" })],
  ["the graphic designer in it", panel(P.pax3, { transitionIn: "cut" })],
  ["Then Pax Romana", cover(C.pax1, { treatment: "panDown", title: "Pax Romana · 2007", transitionIn: "cut" })],
  ["the year 312", panel(P.pax1)],
  ["Five thousand men", cover(C.pax2, { treatment: "focus", focus: { x: 0.5, y: 0.75, zoom: 1.4 } })],
  ["transcripts and maps and diagrams", panel(P.pax4, { transitionIn: "cut" })],
  ["The Black Monday Murders 2016", cover(C.bmm1, { title: "The Black Monday Murders · 2016", transitionIn: "cut" })],
  ["schools of magic", cover(C.bmm5)],
  ["Theodore Dumas", cover(C.bmm2, { transitionIn: "cut" })],
  ["One heads-up", cover(C.bmm5, { treatment: "slowPull", title: "8 issues. No ending (yet)." })],
  ["Transhuman", cover(C.trans, { transitionIn: "cut", treatment: "still" })],
  ["A Red Mass for Mars", cover(C.redMass, { transitionIn: "cut", treatment: "still" })],
  ["The Red Wing", cover(C.redWing, { transitionIn: "cut", treatment: "still" })],
  ["the quorum", cover(C.decorum, { transitionIn: "cut", treatment: "still" })],

  // ── 07 The thread ──────────────────────────────────────────────────────
  ["what ties all this together", { type: "chapter", kicker: "The thread", title: "What ties it together", transitionIn: "cut" }],
  ["The news media", cover(C.nn1, { title: "The news media", transitionIn: "cut", treatment: "still" })],
  ["The Catholic Church", cover(C.pax1, { title: "The Church", transitionIn: "cut", treatment: "still" })],
  ["The atomic bomb program", cover(C.mp(3), { title: "The bomb", transitionIn: "cut", treatment: "still" })],
  ["The United States itself", cover(C.eow(1), { title: "America", transitionIn: "cut", treatment: "still" })],
  ["Wall Street", cover(C.bmm1, { title: "Wall Street", transitionIn: "cut", treatment: "still" })],
  ["up to something way stranger", { type: "grid", assets: [C.nn1, C.pax1, C.mp(3), C.eow(1), C.bmm1], columns: 5, push: 0.03 }],
  ["Hickman loves a secret society", panel(P.chosen, { transitionIn: "cut" })],
  ["the same guy who built Krakoa", cover(C.hox1, { transitionIn: "cut" })],
  ["in his own books first", { type: "pair", assets: [{ asset: C.nn1, label: "2006" }, { asset: C.hox1, label: "2019" }] }],

  // ── 08 Where to start ──────────────────────────────────────────────────
  ["So where do you start", { type: "shelf", slots: 5, numbered: true, title: "Where to start", transitionIn: "cut" }],
  ["The Promise", { type: "shelf", numbered: true, title: "Where to start", items: [{ asset: C.eowTpb, label: "East of West", sub: "Vol. 1 · #1-5" }] }],
  ["Science Bad", { type: "shelf", numbered: true, title: "Where to start", items: [{ asset: C.eowTpb, label: "East of West" }, { asset: C.mpTpb, label: "Manhattan Projects", sub: "Vol. 1 · #1-5" }] }],
  ["where it all started The Nightly News", { type: "shelf", numbered: true, title: "Where to start", items: [{ asset: C.eowTpb, label: "East of West" }, { asset: C.mpTpb, label: "Manhattan Projects" }, { asset: C.nn1, label: "Nightly News" }] }],
  ["something short and strange", { type: "shelf", numbered: true, title: "Where to start", items: [{ asset: C.eowTpb, label: "East of West" }, { asset: C.mpTpb, label: "Manhattan Projects" }, { asset: C.nn1, label: "Nightly News" }, { asset: C.pax1, label: "Pax Romana" }] }],
  ["might never finish", { type: "shelf", numbered: true, title: "Where to start", items: [{ asset: C.eowTpb, label: "East of West" }, { asset: C.mpTpb, label: "Manhattan Projects" }, { asset: C.nn1, label: "Nightly News" }, { asset: C.pax1, label: "Pax Romana" }, { asset: C.bmm1, label: "Black Monday", sub: "Unfinished" }] }],
  ["Check your long boxes first", { type: "grid", assets: MP_EOW, columns: 4, push: 0.03, transitionIn: "cut" }],

  // ── 09 Ending ──────────────────────────────────────────────────────────
  ["That's the part I keep thinking about", { type: "pair", assets: [{ asset: C.mp(1), label: "2012" }, { asset: C.hox1, label: "2019" }], title: "Same guy." }],
  ["Sometimes the discovery isn't at the shop", { type: "grid", assets: CREATOR_OWNED, columns: 5, push: 0.02 }],
  ["tell me in the comments", { type: "end", title: "Read East of West or The Manhattan Projects?\nTell me what to watch for." }],
];

const resolved = resolveAnchors(edited.words, CUES.map(([phrase]) => phrase));
const missing = new Set(resolved.misses.map((m) => m.index));
const kept = CUES.filter(([, seg], idx) => !(seg.optional && missing.has(idx)));
if (kept.length !== CUES.length) CUES.splice(0, CUES.length, ...kept);
const { times, misses } = kept.length === resolved.times.length ? resolved : resolveAnchors(edited.words, CUES.map(([phrase]) => phrase));
if (misses.length) {
  console.warn(`episode-002: ${misses.length} anchor(s) not found in the transcript:\n` + misses.map((m) => `  #${m.index} "${m.phrase}"`).join("\n"));
}
export const anchorMisses = misses;

const segments = CUES.map(([phrase, { optional, ...seg }], idx) => ({
  ...seg,
  at: +Math.max(0, VOICE_AT + times[idx] - LEAD).toFixed(3),
  beat: phrase,
}));

const titleAt = segments.find((s) => s.type === "title")?.at ?? 0;

export default {
  id: "episode-002",
  assetEpisodeId: "episode-002",
  outputDir: "episode-002",
  outputName: "episode-002",
  compositionId: "Episode002",
  title: "Jonathan Hickman's Comics You Might Have Missed",
  duration: +(VOICE_AT + edited.duration + 4).toFixed(3),
  nudges: [],
  audio: {
    narration: {
      asset: NARRATION,
      at: VOICE_AT,
      volume: 0.85,
      clips: editApplies ? [{ at: VOICE_AT, from: 0, to: null }] : edited.clips.map((k) => ({ at: +(VOICE_AT + k.out).toFixed(3), from: k.from, to: k.to })),
    },
    music: { asset: "audio/MUSIC_BED", volume: 0.3, fadeIn: 2, fadeOut: 4, loop: true },
    sting: { asset: "audio/MUSIC_STING", at: titleAt, dur: 7, volume: 0.42, fadeOut: 2 },
  },
  segments,
};
