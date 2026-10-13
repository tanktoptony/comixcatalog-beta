// The Amory Wars, Part 1 (channel episode 004). Narration: Tony's script,
// read by HeyGen text-to-speech (see STATUS.md). Every shot is tied to the
// line it illustrates: real comic covers (ComicVine), album art (Cover Art
// Archive), freely licensed photos (Wikimedia Commons, credited on screen),
// Wayback Machine captures and live ComixCatalog pages. No filler rotation.

import words from "./narration.words.js";
import config from "./episode.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";
import { insertGap } from "../shared/narrationEdit.js";

const VOICE_AT = 0.8;
const LEAD = 0.12;
const GAP_DUR = 2.5;
const before = words.words.find((w, i) => /Wars\.$/.test(w.w) && words.words[i + 1]?.w === "There's");
const after = words.words[words.words.indexOf(before) + 1];
if (!before || !after) throw new Error("episode-004: could not locate channel-sting pause");
const gapAt = +((before.e + after.s) / 2).toFixed(3);
const narrationClips = insertGap([{ from: 0, to: words.duration, out: 0 }], gapAt, gapAt, GAP_DUR);
export const narrationWords = words.words.map((w) => w.s >= gapAt ? ({ ...w, s: +(w.s + GAP_DUR).toFixed(3), e: +(w.e + GAP_DUR).toFixed(3) }) : w);
export const stingGap = { at: +(VOICE_AT + gapAt).toFixed(3), dur: GAP_DUR };

const c = (name) => `covers/${name}.jpg`;
const C = {
  bag1: c("bag-on-line-sstb-001-2004"), bag2: c("bag-on-line-sstb-002-2004"), gn: c("good-apollo-graphic-novel-001-2005"), sketch: c("amory-wars-sketchbook-001-2006"),
  s1: c("amory-wars-sstb-001-2007"), s2: c("amory-wars-sstb-002-2007"), s3: c("amory-wars-sstb-003-2007"), s4: c("amory-wars-sstb-004-2007"), s5: c("amory-wars-sstb-005-2007"),
  ii1: c("amory-wars-ii-001-2008"), ii2: c("amory-wars-ii-002-2008"), ii3: c("amory-wars-ii-003-2008"), ii4: c("amory-wars-ii-004-2008"), ii5: c("amory-wars-ii-005-2008"),
  sult: c("amory-wars-sstb-ultimate-001-2010"), kult: c("amory-wars-keeping-secrets-ultimate-001-2012"),
  ks1: c("amory-wars-keeping-secrets-001-2010"), ks2: c("amory-wars-keeping-secrets-002-2010"), ks3: c("amory-wars-keeping-secrets-003-2010"), ks4: c("amory-wars-keeping-secrets-004-2010"), ks5: c("amory-wars-keeping-secrets-005-2010"), ks6: c("amory-wars-keeping-secrets-006-2010"), ks12: c("amory-wars-keeping-secrets-012-2010"),
  ga1: c("amory-wars-good-apollo-001-2017"), ga2: c("amory-wars-good-apollo-002-2017"), ga3: c("amory-wars-good-apollo-003-2017"), ga6: c("amory-wars-good-apollo-006-2017"), ga12: c("amory-wars-good-apollo-012-2017"),
  nw1: c("amory-wars-no-world-for-tomorrow-001-2024"), nw2: c("amory-wars-no-world-for-tomorrow-002-2024"),
};
// Album art, with real pixel sizes so nothing is squeezed into a comic shape.
const ALB = {
  sstb: ["2002-the-second-stage-turbine-blade", 900, 900], iks: ["2003-in-keeping-secrets-of-silent-earth-3", 1200, 1200], good: ["2005-good-apollo-vol-1", 961, 841],
  nw: ["2007-good-apollo-vol-2-no-world-for-tomorrow", 600, 600], yotbr: ["2010-year-of-the-black-rainbow", 1200, 1194], asc: ["2012-the-afterman-ascension", 1200, 1200],
  desc: ["2013-the-afterman-descension", 1200, 1200], v1: ["2018-vaxis-act-1", 600, 600], v2: ["2022-vaxis-act-2", 600, 600], v3: ["2025-vaxis-act-3", 1085, 1200],
};
const albumPath = (k) => `albums/${ALB[k][0]}.jpg`;
const A = (k, label) => ({ asset: albumPath(k), aspect: ALB[k][1] / ALB[k][2], ...(label ? { label } : {}) });
const album = (k, extra = {}) => ({ type: "panel", asset: albumPath(k), size: [ALB[k][1], ALB[k][2]], treatment: "slowPush", ...extra });
// Wikimedia Commons photos: credit shown on screen.
const PH = {
  live2009: ["coheed-live-2009", 3072, 2304, "Coheed and Cambria live, 2009", "Photo: HeavyMezza89, public domain"],
  bogota: ["coheed-live-bogota-2007", 1280, 960, "Coheed and Cambria live, Bogotá, 2007", "Photo: Juan Andres Martinez, CC BY-SA 2.0"],
  sbA: ["coheed-live-summer-breeze-2016-a", 3840, 2560, "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  sbB: ["coheed-live-summer-breeze-2016-b", 3840, 2560, "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  sbC: ["coheed-live-summer-breeze-2016-c", 3840, 2560, "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  sbD: ["coheed-live-summer-breeze-2016-d", 3840, 2560, "Coheed and Cambria, Summer Breeze 2016", "Photo: Sven Mandel, CC BY-SA 4.0"],
  claudio: ["claudio-sanchez-nycc-2010", 1824, 1497, "Claudio Sanchez, New York Comic Con 2010", "Photo: Luigi Novi, CC BY 3.0"],
  c2e2: ["claudio-chondra-c2e2-2012", 3840, 2560, "Chondra Echert and Claudio Sanchez, C2E2 2012", "Photo: Pat Loika, CC BY 2.0"],
  travis: ["travis-stever-2014", 960, 723, "Travis Stever, 2014", "Photo: Adam Sims, CC BY-SA 4.0"],
  onc: ["old-national-centre-indianapolis", 3840, 3273, "Old National Centre, Indianapolis", "Home of the Egyptian Room · Photo: w_lemay, CC BY-SA 2.0"],
  nyackDown: ["nyack-downtown-2015", 2448, 2448, "Nyack, New York", "Photo: Jondude11, CC BY-SA 4.0"],
  nyack: ["nyack-panorama-2012", 3840, 2880, "Nyack, New York", "Photo: Alexisrael, CC BY-SA 3.0"],
  paris: ["paris-rue-des-francs-bourgeois", 3414, 2052, "Paris", "Photo: Alain Hays, CC BY-SA 4.0"],
  purdue: ["purdue-campus-2012", 3840, 2560, "Purdue University", "Photo: Diego Delso, CC BY-SA 3.0"],
};
const photo = (k, extra = {}) => ({ type: "panel", asset: `photos/${PH[k][0]}.jpg`, size: [PH[k][1], PH[k][2]], treatment: "slowPush", title: PH[k][3], sub: PH[k][4], ...extra });
const SOURCE = { "wb-coheed-2002": "web.archive.org · coheedandcambria.com, 2002", "wb-coheed-av-2002": "web.archive.org · coheedandcambria.com, 2002" };
const screen = (asset, treatment = "push", title, extra = {}) => ({ type: "screen", asset: `screens/${asset}.png`, treatment, ...(title ? { title } : {}), ...(SOURCE[asset] ? { url: SOURCE[asset] } : {}), ...(extra.focus ? { centerFocus: true } : {}), ...extra });
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...extra });
const grid = (assets, extra = {}) => ({ type: "grid", assets, columns: Math.min(assets.length, 6), ...extra });
const fan = (assets, extra = {}) => ({ type: "fan", assets, ...extra });
const pair = (assets, extra = {}) => ({ type: "pair", assets, ...extra });
const quote = (text) => ({ type: "quote", text });
const cut = { transitionIn: "cut" };

const SSTB07 = [C.s1, C.s2, C.s3, C.s4, C.s5];
const KS = [C.ks1, C.ks2, C.ks3, C.ks4, C.ks5, C.ks6];
const II = [C.ii1, C.ii2, C.ii3, C.ii4, C.ii5];
const MIX = [C.bag1, C.gn, C.s1, C.ii1, C.ks1, C.ga1, C.nw1];
const ALL_ALBUMS = ["sstb", "iks", "good", "nw", "yotbr", "asc", "desc", "v1", "v2", "v3"].map((k) => A(k));
const ORIGINAL5 = ["sstb", "iks", "good", "nw", "yotbr"].map((k) => A(k));
const PUB_ORDER = [C.bag1, C.bag2, C.gn, C.sketch, C.s1, C.ii1, C.sult, C.ks1, C.kult, C.ga1, C.nw1];

const CUES = [
  // ── Cold open ───────────────────────────────────────────────────────────
  ["Imagine discovering a band", photo("sbD")],
  ["You listen to their records", grid(["sstb", "iks", "good", "nw"].map((k) => A(k)), { columns: 4 })],
  ["you see them live", photo("live2009", cut)],
  ["Maybe you even become", photo("bogota", cut)],
  ["Then somewhere along the way", album("sstb")],
  ["pieces of a much larger story", fan([C.bag1, C.s1, C.ks1, C.ga1, C.nw1])],
  ["Not just a concept album", album("good", cut)],
  ["an entire science fiction universe", cover(C.ks2, { treatment: "slowPull", ...cut })],
  ["A story of interplanetary war", cover(C.ks3, { treatment: "panDown", ...cut })],
  ["political conspiracy", cover(C.ks6, { treatment: "still", ...cut })],
  ["artificial intelligence", cover(C.ii5, { treatment: "still", ...cut })],
  ["prophecy and a family", cover(C.nw1, { treatment: "still", ...cut })],
  ["caught in the middle", cover(C.bag2, { ...cut })],
  ["And that story doesn't just exist", album("sstb", { treatment: "slowPull" })],
  ["It exists in comic books", cover(C.bag1, cut)],
  ["graphic novels", cover(C.gn, cut)],
  ["It has been told retold", grid([...SSTB07, C.sult], { columns: 6 })],
  ["occasionally left unfinished", pair([{ asset: C.bag1, label: "#1" }, { asset: C.bag2, label: "#2" }])],
  ["Welcome to the world of", grid(MIX, { columns: 7, ...cut })],
  ["welcome to the Amory Wars", cover(C.sketch, { treatment: "slowPull" })],

  // ── Title and the problem ───────────────────────────────────────────────
  ["There's just one problem", { type: "title", kicker: "ComixCatalog Originals · The Amory Wars", title: "Part 1", sub: "Where the story came from", assets: [C.bag1, C.s1, C.ks1, C.ga1, C.nw1, C.gn], wall: 0.5, transitionIn: "cut" }],
  ["If you want to experience", grid(ALL_ALBUMS, { columns: 5, ...cut })],
  ["where exactly are you supposed", fan(PUB_ORDER.slice(0, 7))],
  ["The albums weren't released", pair([A("yotbr", "2010"), A("sstb", "2002")], cut)],
  ["the earliest comics were never completed", pair([{ asset: C.bag1, label: "#1 · 2004" }, { asset: C.bag2, label: "#2 · 2004" }], cut)],
  ["certain parts of the story were rewritten", pair([{ asset: C.bag1, label: "2004" }, { asset: C.s1, label: "2007" }], cut)],
  ["most important information", screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.35, y: 0.5 }, zoom: 1.4 })],
  ["lyrics liner notes", album("iks", cut)],
  ["Even dedicated fans", photo("sbD", { treatment: "slowPull" })],
  ["But there's something fascinating", cover(C.sketch, cut)],
  ["the history of the Amory Wars", grid(PUB_ORDER.slice(0, 6), { columns: 6 })],
  ["to understand how we got here", album("sstb", cut)],

  // ── Where it started ────────────────────────────────────────────────────
  ["In the fall of 2002", { type: "chapter", title: "Where it started", transitionIn: "cut" }],
  ["college dorm room", screen("wb-coheed-2002", "push", undefined, { focus: { x: 0.5, y: 0.3 }, zoom: 1.3 })],
  ["a burned copy of an album", album("sstb", { title: "The Second Stage Turbine Blade", sub: "Album art · 2002", ...cut })],
  ["I had no idea", screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.35, y: 0.55 }, zoom: 1.5 })],
  ["At the time", photo("bogota", cut)],
  ["progressive rock punk and post", photo("sbA", cut)],
  ["Their music was technical", photo("sbB", cut)],
  ["emotional without sounding", photo("sbC", cut)],
  ["And then there was the voice", photo("claudio", cut)],
  ["It was unlike anything", photo("live2009", { treatment: "slowPull" })],
  ["But what I didn't realize", fan(MIX)],
  ["I've followed", photo("sbD", cut)],
  ["I've seen them live more than", photo("bogota", { treatment: "slowPull", ...cut })],
  ["I've collected the albums", grid(ORIGINAL5, { columns: 5, ...cut })],
  ["the comics and the various", grid(PUB_ORDER.slice(0, 6), { columns: 6, ...cut })],
  ["I've watched the mythology develop", fan([C.bag1, C.s1, C.ks1, C.ga1, C.nw1])],
  ["growing pains", cover(C.bag2, cut)],
  ["The abandoned comics", pair([{ asset: C.bag1, label: "#1" }, { asset: C.bag2, label: "#2" }], cut)],
  ["the revised artwork", pair([{ asset: C.bag1, label: "2004" }, { asset: C.s1, label: "2007" }], cut)],
  ["the long periods between releases", grid(["sstb", "iks", "good", "nw", "yotbr", "asc"].map((k) => A(k)), { columns: 6, ...cut })],
  ["the occasional mystery", cover(C.ks12, { treatment: "focus", focus: { x: 0.5, y: 0.45, zoom: 1.4 }, ...cut })],
  ["I certainly didn't understand", album("sstb", { treatment: "slowPull", ...cut })],
  ["still pretty confusing", cover(C.ii3, cut)],
  ["the reasons I wanted to make this series", grid([...SSTB07, ...II], { columns: 5 })],
  ["explore the entire Amory Wars saga", grid(ALL_ALBUMS, { columns: 5, ...cut })],
  ["album by album", album("iks", cut)],
  ["comic by comic", cover(C.s1, cut)],
  ["paying attention to both", cover(C.ks1)],
  ["But before we can start", cover(C.sketch, { treatment: "slowPull", ...cut })],
  ["we're going to France", photo("paris", cut)],

  // ── The Shabütie era ────────────────────────────────────────────────────
  ["Before there was", { type: "chapter", title: "The Shabütie era", transitionIn: "cut" }],
  ["The band emerged in New York", photo("nyack", cut)],
  ["developing an unusual sound", photo("nyackDown", cut)],
  ["aggressive guitars", photo("sbC", cut)],
  ["Some of what would eventually", photo("live2009", cut)],
  ["Complicated song structures", photo("sbA", cut)],
  ["dramatic shifts in mood", photo("sbB", cut)],
  ["heaviness and vulnerability", photo("claudio", cut)],
  ["But the elaborate mythology", cover(C.sketch, cut)],
  ["a trip to Paris in 1998", photo("paris", cut)],
  ["The unfamiliar surroundings", photo("paris", { treatment: "slowPull" })],
  ["he began developing an idea", cover(C.bag1, cut)],
  ["Now here's one of my favorite details", cover(C.bag1, { title: "The Bag On Line Adventures #1", sub: "Evil Ink, 2004 · Art: Wes Abbott", treatment: "slowPull", ...cut })],
  ["The original name", cover(C.sketch, cut)],
  ["It was the Bag Online Adventures", quote("It was The Bag On Line Adventures.")],
  ["there was a luggage shop", photo("paris", cut)],
  ["That's it One of the most", quote("That's it.")],
  ["elaborate mythologies in modern", grid(MIX, { columns: 7, ...cut })],
  ["a bag shop in Paris", cover(C.bag2, cut)],
  ["They rarely arrive fully formed", cover(C.sketch, { treatment: "slowPull", ...cut })],
  ["Sometimes you start with a feeling", cover(C.gn, cut)],
  ["a strange name on a storefront", photo("paris", { treatment: "slowPull", ...cut })],
  ["Originally the characters", cover(C.s1, cut)],
  ["qualities of his parents", cover(C.s2, cut)],
  ["the role of their son", cover(C.ii1, cut)],
  ["That shift matters", cover(C.ks1, cut)],
  ["underneath the spaceships", cover(C.ks3, { treatment: "still", ...cut })],
  ["alien technology", cover(C.ii5, { treatment: "still", ...cut })],
  ["political conspiracies", cover(C.ks6, { treatment: "still", ...cut })],
  ["apocalyptic prophecies", cover(C.nw2, { treatment: "still", ...cut })],
  ["a deeply personal story", album("sstb", cut)],
  ["It's about family identity", cover(C.bag2, cut)],
  ["those ideas would become the foundation", photo("live2009", cut)],

  // ── The Second Stage Turbine Blade ──────────────────────────────────────
  ["By 2002", { type: "chapter", title: "The Second Stage Turbine Blade", transitionIn: "cut" }],
  ["released its first full", album("sstb", { title: "The Second Stage Turbine Blade", sub: "Album art · 2002", ...cut })],
  ["For many listeners", screen("wb-coheed-av-2002", "push", "The band's site, 2002")],
  ["the story underneath the record", cover(C.bag1, cut)],
  ["characters with strange names", cover(C.s3, cut)],
  ["betrayal violence", cover(C.s4, cut)],
  ["family and transformation", cover(C.s5, cut)],
  ["References to events", cover(C.ks12, cut)],
  ["The album could be enjoyed", album("sstb", { treatment: "slowPull", ...cut })],
  ["But if you wanted to know precisely", grid(SSTB07, { columns: 5, ...cut })],
  ["The story centers on", cover(C.s1, { title: "The Amory Wars #1", sub: "Image / Evil Ink, 2007", ...cut })],
  ["appear to be ordinary parents", cover(C.s2, cut)],
  ["hiding an extraordinary secret", cover(C.s3, { treatment: "focus", focus: { x: 0.5, y: 0.5, zoom: 1.4 }, ...cut })],
  ["machinations of an authoritarian", cover(C.ks6, { treatment: "focus", focus: { x: 0.5, y: 0.65, zoom: 1.4 }, ...cut })],
  ["an engineered biological threat", cover(C.ii4, cut)],
  ["a conflict that threatens", cover(C.ks3, cut)],
  ["the entire system of worlds", cover(C.ks2, { treatment: "slowPull", ...cut })],
  ["And their son Claudio", cover(C.ks1, cut)],
  ["we're going to spend an entire episode", album("sstb", cut)],
  ["But it's important to recognize", photo("sbD", cut)],
  ["The fictional mythology and the emotional", pair([A("sstb", "The album · 2002"), { asset: C.s1, label: "The comic · 2007" }], cut)],
  ["The anguish uncertainty", cover(C.bag2, { treatment: "focus", focus: { x: 0.5, y: 0.45, zoom: 1.4 }, ...cut })],
  ["One of the things I've always appreciated", photo("claudio", cut)],
  ["anger jealousy heartbreak", photo("sbC", cut)],
  ["You can hear it in songs like", album("iks", { title: "\"The Camper Velourium II: Backend of Forever\"", sub: "In Keeping Secrets of Silent Earth: 3 · 2003", ...cut })],
  ["There's something fascinating about the contrast", pair([A("good", "Album · 2005"), { asset: C.gn, label: "Graphic novel · 2005" }], cut)],
  ["Underneath all the elaborate", photo("bogota", cut)],
  ["as the band's audience grew", photo("sbD", cut)],

  // ── When the music wasn't enough ────────────────────────────────────────
  ["In 2003", { type: "chapter", title: "When the music wasn't enough", transitionIn: "cut" }],
  ["released In Keeping Secrets", album("iks", { title: "In Keeping Secrets of Silent Earth: 3", sub: "Album art · 2003", ...cut })],
  ["The music became bigger", photo("live2009", cut)],
  ["the fictional universe expanded", grid(KS, { columns: 6, ...cut })],
  ["Then in 2005 came Good Apollo", album("good", { title: "Good Apollo, I'm Burning Star IV, Volume One", sub: "Album art · 2005", ...cut })],
  ["a pretty spectacular album title", album("good", { treatment: "slowPull" })],
  ["By this point it was clear", grid(["sstb", "iks", "good"].map((k) => A(k)), { columns: 3, ...cut })],
  ["building something with enormous ambition", grid([...SSTB07, ...II], { columns: 5, ...cut })],
  ["But there was a practical challenge", album("iks", { treatment: "slowPull", ...cut })],
  ["Songs aren't necessarily", screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.35, y: 0.6 }, zoom: 1.5 })],
  ["A lyric can establish a mood", album("nw", cut)],
  ["where that character is standing", cover(C.ii2, { treatment: "still", ...cut })],
  ["who they're speaking to", cover(C.ii3, { treatment: "still", ...cut })],
  ["why an interplanetary government", cover(C.ks6, { treatment: "still", ...cut })],
  ["piece those details together", grid(ORIGINAL5, { columns: 5, ...cut })],
  ["telling the story visually", photo("c2e2", cut)],
  ["Which brings us to the comics", fan(MIX)],
  ["particularly interesting", cover(C.bag1, cut)],
  ["For a comic collector", screen("cc-bag-on-line", "push", "The Bag On Line Adventures on ComixCatalog")],
  ["the version of the Amory Wars that readers", grid(SSTB07, { columns: 5, ...cut })],
  ["The early project was called", pair([{ asset: C.bag1, label: "#1 · 2004" }, { asset: C.bag2, label: "#2 · 2004" }], { title: "The Bag On Line Adventures", sub: "Evil Ink · Art: Wes Abbott", ...cut })],
  ["Its original comic adaptation", cover(C.bag1, { treatment: "focus", focus: { x: 0.5, y: 0.35, zoom: 1.4 }, ...cut })],
  ["with artwork by", cover(C.bag2, { title: "Art: Wes Abbott", ...cut })],
  ["But it only made it through", pair([{ asset: C.bag1, label: "#1" }, { asset: C.bag2, label: "#2" }], cut)],
  ["Two I remember", quote("Two.")],
  ["buying those original comics", photo("purdue", cut)],
  ["I was already following", cover(C.bag1, { treatment: "slowPull", ...cut })],
  ["come to life on the page", cover(C.bag2, cut)],
  ["These weren't back issues", screen("cc-bag-on-line", "panDown")],
  ["And then the series stopped", cover(C.bag2, { treatment: "still", title: "#2 · 2004", ...cut })],
  ["Imagine being a", photo("bogota", cut)],
  ["increasingly elaborate albums", grid(["sstb", "iks", "good"].map((k) => A(k)), { columns: 3, ...cut })],
  ["Finally there are actual comics", pair([{ asset: C.bag1, label: "#1" }, { asset: C.bag2, label: "#2" }], cut)],
  ["And then they stop", cover(C.bag2, { treatment: "still", ...cut })],
  ["For years the printed story", photo("live2009", { treatment: "slowPull", ...cut })],

  // ── The comics and their revisions ──────────────────────────────────────
  ["Another unusual piece", { type: "chapter", title: "The comics and their revisions", transitionIn: "cut" }],
  ["a graphic novel adaptation of Good Apollo", cover(C.gn, { title: "Good Apollo, I'm Burning Star IV, Volume One", sub: "Graphic novel · Evil Ink, 2005 · Art: Christopher Shy", ...cut })],
  ["an album much further along", album("good", cut)],
  ["even as the mythology developed", grid([C.bag1, C.bag2, C.gn], { columns: 3, ...cut })],
  ["two comic books a graphic novel", grid([{ asset: C.bag1 }, { asset: C.bag2 }, { asset: C.gn }, A("sstb"), A("iks"), A("good")], { columns: 6, title: "Two comics, a graphic novel, three albums", ...cut })],
  ["I don't think we should dismiss", cover(C.bag1, { treatment: "slowPull", ...cut })],
  ["There's something admirable about a musician", photo("c2e2", cut)],
  ["collaborators publishers artists", grid([C.bag1, C.s1, C.sketch, C.ks1], { columns: 4, title: "Evil Ink · Image · 12-Gauge · BOOM!", ...cut })],
  ["Those first attempts", pair([{ asset: C.bag1, label: "2004" }, { asset: C.gn, label: "2005" }], cut)],
  ["This world could exist outside", cover(C.sketch, cut)],
  ["Claudio would return to the beginning", cover(C.s1, { treatment: "slowPull", ...cut })],
  ["In 2007 the Amory Wars began", grid(SSTB07, { columns: 5, title: "The Amory Wars, 2007", sub: "Evil Ink and Image Comics", ...cut })],
  ["with a new adaptation", cover(C.s1, { title: "The Amory Wars #1", sub: "Evil Ink and Image Comics, 2007", ...cut })],
  ["The material was revisited", pair([{ asset: C.bag1, label: "2004" }, { asset: C.s1, label: "2007" }], cut)],
  ["a much more complete narrative", grid([...SSTB07, C.sult], { columns: 6, ...cut })],
  ["Further adaptations followed", grid(II, { columns: 5, title: "Amory Wars II · 2008", ...cut })],
  ["additional portions of the albums", grid(KS, { columns: 6, title: "In Keeping Secrets of Silent Earth: 3 · BOOM!, 2010", ...cut })],
  ["a small unconventional project", grid([C.sult, C.kult, C.ga1, C.nw1], { columns: 4, ...cut })],
  ["an established comic book property", screen("cc-search-amory-wars", "push", "The Amory Wars on ComixCatalog", { focus: { x: 0.45, y: 0.35 }, zoom: 1.2 })],
  ["that didn't mean everything", fan(MIX)],
  ["Different versions of the same story", pair([{ asset: C.bag1, label: "2004" }, { asset: C.sult, label: "2010 Ultimate Edition" }], cut)],
  ["Here's something I wish somebody", grid(ORIGINAL5, { columns: 5, ...cut })],
  ["There are really three different", quote("Three timelines.")],
  ["The first is the release history", grid(ALL_ALBUMS, { columns: 5, title: "1. Album release order", ...cut })],
  ["The second is the actual chronological", grid(["yotbr", "sstb", "iks", "good", "nw"].map((k) => A(k)), { columns: 5, title: "2. Story order (the original five)", ...cut })],
  ["And the third is the publication", grid(PUB_ORDER, { columns: 6, title: "3. Comic publication order", ...cut })],
  ["was the first", album("sstb", { title: "The first album · 2002", ...cut })],
  ["isn't the earliest story", album("yotbr", cut)],
  ["Year of the Black Rainbow released", pair([A("yotbr", "2010 album"), A("sstb", "2002 album")], { title: "Earlier story. Later release.", ...cut })],
  ["the comics adapted portions", pair([A("sstb", "Album · 2002"), { asset: C.s1, label: "Comic · 2007" }], cut)],
  ["earliest printed material was superseded", pair([{ asset: C.bag1, label: "2004" }, { asset: C.sult, label: "2010" }], cut)],
  ["started collecting in 2004", pair([{ asset: C.bag1, label: "#1" }, { asset: C.bag2, label: "#2" }], cut)],
  ["discovered the band in 2018", album("v1", { title: "Vaxis, Act I", sub: "Album art · 2018", ...cut })],
  ["And that's before we even get to", grid(["asc", "desc", "v1", "v2", "v3"].map((k) => A(k)), { columns: 5, title: "The Afterman and Vaxis", ...cut })],
  ["For newcomers", grid(ALL_ALBUMS, { columns: 5, ...cut })],
  ["a uniquely interesting subject", fan(PUB_ORDER.slice(4, 11))],

  // ── A universe that grew up ─────────────────────────────────────────────
  ["Because we're not simply", { type: "chapter", title: "A universe that grew up", transitionIn: "cut" }],
  ["a universe that has evolved", photo("sbD", cut)],
  ["The music informed the comics", pair([A("iks", "Album · 2003"), { asset: C.ks1, label: "Comic · 2010" }], cut)],
  ["The comics clarified the music", cover(C.ks3, cut)],
  ["Later books expanded earlier ideas", cover(C.ga1, cut)],
  ["new albums introduced entirely", grid(["asc", "desc", "v1", "v2", "v3"].map((k) => A(k)), { columns: 5, ...cut })],
  ["That process hasn't always been", pair([{ asset: C.bag1, label: "2004" }, { asset: C.s1, label: "2007" }], cut)],
  ["grown with its audience", pair([A("sstb", "2002"), A("v3", "2025")], cut)],
  ["Before we conclude", cover(C.sketch, cut)],
  ["memorize an entire fictional encyclopedia", grid([...SSTB07, ...II, C.ks1, C.ks6], { columns: 6, ...cut })],
  ["understanding a few basic relationships", cover(C.ks1, cut)],

  // ── Heaven's Fence ──────────────────────────────────────────────────────
  ["First there's Heaven's Fence", { type: "chapter", title: "Heaven's Fence", transitionIn: "cut" }],
  ["the setting of the original", cover(C.ks2, { treatment: "slowPull", ...cut })],
  ["a system of planets bound together", cover(C.ks3, cut)],
  ["known as the Keywork", cover(C.ks2, { treatment: "focus", focus: { x: 0.5, y: 0.6, zoom: 1.5 }, ...cut })],
  ["The Keywork is more than", cover(C.ii5, cut)],
  ["Its true nature", cover(C.nw1, cut)],
  ["the power of Wilhelm Ryan", cover(C.ks6, { treatment: "focus", focus: { x: 0.5, y: 0.35, zoom: 1.3 }, ...cut })],
  ["a tyrannical ruler", cover(C.ks6, { treatment: "focus", focus: { x: 0.5, y: 0.7, zoom: 1.6 } })],
  ["Opposing him are several", grid(II, { columns: 5, ...cut })],
  ["a resistance movement", cover(C.ks4, cut)],
  ["a powerful race of beings", cover(C.nw1, { treatment: "slowPull", ...cut })],
  ["One of those beings", cover(C.nw2, cut)],
  ["an enormously important role", cover(C.ga1, cut)],
  ["And at the center of much of this", grid(SSTB07, { columns: 5, ...cut })],
  ["and their children", cover(C.s2, cut)],
  ["especially Claudio", cover(C.ks1, cut)],
  ["Claudio is not some confident", cover(C.ii1, cut)],
  ["He's a young man whose", cover(C.ii2, cut)],
  ["violently overturned", cover(C.ii3, { treatment: "still", ...cut })],
  ["Over the course of the saga", fan([C.ii1, C.ks1, C.ga1, C.nw1, C.nw2])],
  ["terrifying revelations", cover(C.ks12, cut)],
  ["despite the enormous cosmic scale", cover(C.ks2, cut)],
  ["how many planets exist", cover(C.ks3, cut)],
  ["what happens to a person", cover(C.bag2, { treatment: "focus", focus: { x: 0.5, y: 0.45, zoom: 1.4 }, ...cut })],
  ["whether they can decide", cover(C.ga12, cut)],

  // ── Why this series ─────────────────────────────────────────────────────
  ["It's been nearly 25 years", { type: "chapter", title: "Why this series", transitionIn: "cut" }],
  ["since I first listened", album("sstb", cut)],
  ["Back then I was just a college student", photo("purdue", cut)],
  ["listening to a burned CD", screen("wb-coheed-av-2002", "push", undefined, { focus: { x: 0.35, y: 0.45 }, zoom: 1.4 })],
  ["fascinated by the energy", photo("bogota", cut)],
  ["what makes this project so special", grid(ALL_ALBUMS, { columns: 5, ...cut })],
  ["develop not just as a band", photo("sbD", cut)],
  ["but as storytellers", photo("c2e2", cut)],
  ["I've seen the comics evolve", fan([C.bag1, C.gn, C.s1, C.ks1, C.ga1, C.nw1])],
  ["the universe expand", grid(["asc", "desc", "v1", "v2", "v3"].map((k) => A(k)), { columns: 5, ...cut })],
  ["mysterious fragments become", pair([{ asset: C.bag1, label: "2004" }, { asset: C.nw1, label: "2024" }], cut)],
  ["I even had the chance", photo("claudio", cut)],
  ["and Travis", photo("travis", cut)],
  ["at the Egyptian Room", photo("onc", cut)],
  ["It was the first time", photo("live2009", cut)],
  ["how kind Claudio was", photo("claudio", { treatment: "slowPull", ...cut })],
  ["Now I want to revisit", album("sstb", cut)],
  ["We're going to examine the music", album("iks", cut)],
  ["the comics the characters", cover(C.s1, cut)],
  ["the creative decisions", photo("c2e2", cut)],
  ["explore the differences between early", pair([{ asset: C.bag1, label: "2004" }, { asset: C.sult, label: "2010" }], cut)],
  ["look closely at the artwork", cover(C.gn, { treatment: "focus", focus: { x: 0.5, y: 0.4, zoom: 1.4 }, ...cut })],
  ["how this extraordinary project developed", grid(PUB_ORDER, { columns: 6, ...cut })],
  ["This series is also a natural fit", screen("cc-search-amory-wars", "push", "The Amory Wars on ComixCatalog", { focus: { x: 0.45, y: 0.35 }, zoom: 1.2 })],
  ["part of the joy of collecting", screen("cc-bag-on-line", "push", "The Bag On Line Adventures")],
  ["A series A creative", screen("cc-amory-wars-2007", "panDown", "The Amory Wars, 2007")],
  ["A universe", grid(ALL_ALBUMS, { columns: 5, ...cut })],
  ["few comic book properties", fan(PUB_ORDER.slice(0, 7))],
  ["next time we're going back", album("sstb", { title: "Next: The Second Stage Turbine Blade", ...cut })],
  ["Back to the second stage", grid(SSTB07, { columns: 5, ...cut })],
  ["Back to the", cover(C.s1, cut)],
  ["a story that begins with one", cover(C.s3, { treatment: "slowPush", ...cut })],
  ["The stage is set", cover(C.sketch, { treatment: "slowPull", ...cut })],
];

const resolved = resolveAnchors(narrationWords, CUES.map(([phrase]) => phrase));
export const anchorMisses = resolved.misses;
if (anchorMisses.length) throw new Error(`episode-004: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, VOICE_AT + resolved.times[i] - LEAD).toFixed(3), beat: phrase }));
segments.push({ type: "sting", at: stingGap.at, beat: "Channel sting", transition: "cut" });
segments.push({ type: "end", at: +(VOICE_AT + narrationWords.at(-1).e).toFixed(3), dur: 5, beat: "End card", title: "Next: The Second Stage Turbine Blade", sub: "Which Coheed record got you first?", transitionIn: "cut" });
segments.sort((x, y) => x.at - y.at);

export default {
  id: "episode-004", assetEpisodeId: "episode-004", outputDir: "episode-004", outputName: "episode-004", compositionId: "Episode004",
  title: config.titleOptions[0], duration: +(VOICE_AT + words.duration + GAP_DUR + 5).toFixed(3), nudges: [], segments,
  audio: {
    narration: { asset: "audio/NARRATION_LEVELED.wav", at: VOICE_AT, volume: 1, clips: narrationClips.map((clip) => ({ at: +(VOICE_AT + clip.out).toFixed(3), from: clip.from, to: clip.to })) },
    // One continuous pre-built bed (MUSIC_BED_FULL.wav: the track minus its fade-out tail, 1 s crossfades between passes).
    // Looping the mp3 left silent gaps at each pass end, and Remotion dropped the bed entirely at 180.0 s.
    music: { asset: "audio/MUSIC_BED_FULL.wav", volume: 0.2, fadeIn: 2, fadeOut: 4, loop: false, duck: [{ from: stingGap.at, to: stingGap.at + stingGap.dur }] },
    // Funkorama's band enters at 7.13 s; start there so the hit lands with the logo.
    sting: { asset: "audio/MUSIC_STING.mp3", at: stingGap.at, from: 7.1, dur: stingGap.dur, volume: 1, fadeOut: 0.4 },
  },
};
