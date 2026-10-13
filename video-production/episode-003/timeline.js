// Episode 003: Two Long Boxes and the Birth of ComixCatalog.
// All visuals are real covers, live-site screenshots, or brand cards.

import words from "./narration.words.js";
import narrationEdit from "./narration.edit.js";
import config from "./episode.json" with { type: "json" };
import { resolveAnchors } from "../shared/anchors.js";
import { applyEdit, insertGap } from "../shared/narrationEdit.js";

const VOICE_AT = 0.8;
const LEAD = 0.12;
const GAP_DUR = 2.5;
const editApplies = narrationEdit?.source === words.source;
const edited = applyEdit(words, editApplies ? narrationEdit : null);
const beforeBut = edited.words.find((w, i) => w.w === "collection?" && edited.words[i + 1]?.w === "But");
const but = edited.words[edited.words.indexOf(beforeBut) + 1];
if (!beforeBut || !but) throw new Error("episode-003: could not locate channel-sting pause");
const gapAt = +((beforeBut.e + but.s) / 2).toFixed(3);
const narrationClips = insertGap([{ from: 0, to: edited.duration, out: 0 }], gapAt, gapAt, GAP_DUR);
export const narrationWords = edited.words.map((w) => w.s >= gapAt ? ({ ...w, s: +(w.s + GAP_DUR).toFixed(3), e: +(w.e + GAP_DUR).toFixed(3) }) : w);
export const stingGap = { at: +(VOICE_AT + gapAt).toFixed(3), dur: GAP_DUR };

const c = (name) => `covers/${name}.jpg`;
const s = (name) => `screens/${name}.png`;
const C = {
  amory: c("amory-wars-keeping-secrets-001-2010"),
  ks1: c("amory-wars-keeping-secrets-001-2010"), ks2: c("amory-wars-keeping-secrets-002-2010"), ks3: c("amory-wars-keeping-secrets-003-2010"), ks4: c("amory-wars-keeping-secrets-004-2010"), ks5: c("amory-wars-keeping-secrets-005-2010"),
  goodApollo1: c("amory-wars-good-apollo-001-2017"), goodApollo2: c("amory-wars-good-apollo-002-2017"), noWorld1: c("amory-wars-no-world-for-tomorrow-001-2024"),
  cerebus1: c("cerebus-001-1977"), cerebus2: c("cerebus-002-1977"), cerebus3: c("cerebus-003-1977"), cerebus4: c("cerebus-004-1977"), cerebus5: c("cerebus-005-1977"), cerebus6: c("cerebus-006-1977"), cerebus7: c("cerebus-007-1977"), cerebus8: c("cerebus-008-1977"), cerebus10: c("cerebus-010-1977"), cerebus20: c("cerebus-020-1977"), cerebus26: c("cerebus-026-1977"),
  milk1: c("milk-and-cheese-001-1991"), milk2: c("milk-and-cheese-002-1991"), milk3: c("milk-and-cheese-003-1991"), milk4: c("milk-and-cheese-004-1991"), milk5: c("milk-and-cheese-005-1991"), milk6: c("milk-and-cheese-006-1991"), milk7: c("milk-and-cheese-007-1991"),
  scud1: c("scud-the-disposable-assassin-001-1994"), scud2: c("scud-the-disposable-assassin-002-1994"), scud3: c("scud-the-disposable-assassin-003-1994"), scud4: c("scud-the-disposable-assassin-004-1994"), scud5: c("scud-the-disposable-assassin-005-1994"), scud6: c("scud-the-disposable-assassin-006-1994"), scud10: c("scud-the-disposable-assassin-010-1994"), scud15: c("scud-the-disposable-assassin-015-1994"), scud18: c("scud-the-disposable-assassin-018-1994"), scud20: c("scud-the-disposable-assassin-020-1994"), scud21: c("scud-the-disposable-assassin-image-021-2008"),
  prime: c("prime-001-1993"), hardcase: c("hardcase-001-1993"), strangers: c("the-strangers-001-1993"),
  mantra: c("mantra-001-1993"), firearm: c("firearm-001-1993"), nightMan: c("the-night-man-001-1993"), freex: c("freex-001-1993"), prototype: c("prototype-001-1993"),
  iron: c("iron-man-290-1993"), surfer: c("silver-surfer-075-1992"), avengers: c("avengers-350-1992"),
  xmen: c("x-men-001-1991"), xmen1: c("x-men-001-1991-variant-1"), xmen3: c("x-men-001-1991-variant-3"), xmen4: c("x-men-001-1991-variant-4"), xmen5: c("x-men-001-1991-variant-5"),
};
const BOX6 = [C.cerebus1, C.iron, C.milk1, C.surfer, C.scud1, C.avengers];
const BOX9 = [C.cerebus1, C.cerebus2, C.milk1, C.milk2, C.scud1, C.scud2, C.iron, C.surfer, C.avengers];
const cover = (asset, extra = {}) => ({ type: "cover", asset, treatment: "slowPush", ...extra });
// Captures from other sites say where they came from in the address bar.
const SOURCE = {
  "discogs-2001-home": "web.archive.org · discogs.com, February 2001",
  "discogs-homework-top": "web.archive.org · discogs.com, September 2026",
  "discogs-homework-versions": "web.archive.org · discogs.com, September 2026",
  "discogs-homework-sellers": "web.archive.org · discogs.com, May 2024",
  "gcd-milk-and-cheese": "web.archive.org · comics.org, 2019",
  "allowlist-code": "src/lib/publisher.js",
};
const screen = (asset, treatment = "push", title, extra = {}) => ({
  type: "screen", asset: s(asset), treatment, ...(title ? { title } : {}),
  ...(SOURCE[asset] ? { url: SOURCE[asset] } : {}), ...(asset === "allowlist-code" ? { dots: false } : {}),
  ...(extra.focus ? { centerFocus: true } : {}), ...extra,
});

const CUES = [
  ["A friend of mine recently", { type: "grid", assets: BOX6, columns: 3 }],
  ["Hundreds of comics", { type: "fan", assets: [C.cerebus2, C.milk2, C.scud2, C.iron, C.surfer] }],
  ["two things", { type: "grid", assets: [C.cerebus1, C.milk1, C.scud1], columns: 3 }],
  ["what the hell was in these boxes", { type: "fan", assets: [C.cerebus5, C.iron, C.milk5, C.xmen3, C.scud4, C.mantra, C.surfer] }],
  ["how well could the comic book website", screen("home", "push", "2. Could my website handle it?")],

  ["But before I get into that", { type: "chapter", kicker: "Part one", title: "Why I built it", transitionIn: "cut" }],
  ["living with a roommate", screen("discogs-homework-top")],
  ["He could catalog his records", screen("discogs-homework-top", "push", undefined, { focus: { x: 0.72, y: 0.12 }, zoom: 1.5 })],
  ["find specific pressings", screen("discogs-homework-versions", "push", undefined, { focus: { x: 0.3, y: 0.5 }, zoom: 1.6 })],
  ["buy from sellers all over the world", screen("discogs-homework-sellers")],
  ["my own comic collection", { type: "grid", assets: [C.ks1, C.ks2, C.ks3, C.ks4, C.ks5], columns: 5, title: "The Amory Wars", sub: "Coheed and Cambria" }],
  ["books I wanted to find", { type: "fan", assets: [C.ks2, C.ks3, C.ks4, C.ks5, C.goodApollo1, C.noWorld1] }],
  ["Why couldn't I just open a website", cover(C.goodApollo1)],
  ["master's in software engineering", { type: "quote", text: "A master's in software engineering." }],
  ["somebody made discogs", screen("discogs-homework-top", "push", "Discogs for comics?")],
  ["what if that somebody was me", screen("home")],
  ["Fast forward to my friend", { type: "grid", assets: BOX6, columns: 3, transitionIn: "cut" }],
  ["whether the thing I'd been building", { type: "title", kicker: "ComixCatalog · Episode 003", title: "Two Long\nBoxes", sub: "The real test for ComixCatalog", assets: [C.cerebus1, C.milk1, C.scud1, C.cerebus3, C.milk3, C.scud20], wall: 0.45 }],

  ["If you've never used discogs", { type: "chapter", title: "Why Discogs works", transitionIn: "cut" }],
  ["Every record has its own page", screen("discogs-homework-top", "push", undefined, { focus: { x: 0.3, y: 0.12 }, zoom: 1.6 })],
  ["you click a button", screen("discogs-homework-top", "push", undefined, { focus: { x: 0.72, y: 0.12 }, zoom: 1.7 })],
  ["built by the people who use it", screen("discogs-2001-home", "push", undefined, { focus: { x: 0.12, y: 0.27 }, zoom: 1.4 })],
  ["started in 2000", screen("discogs-2001-home", "push", "Discogs.com, February 2001")],
  ["No rock and roll", screen("discogs-2001-home", "push", undefined, { focus: { x: 0.5, y: 0.1 }, zoom: 1.6 })],
  ["other collectors showed up", screen("discogs-homework-versions", "push", "Today: 108 versions of one Daft Punk album", { focus: { x: 0.3, y: 0.5 }, zoom: 1.6 })],
  ["Hold on to that", screen("discogs-2001-home", "push", "2001: 1,943 releases. 56 contributors.", { focus: { x: 0.12, y: 0.47 }, zoom: 1.45 })],
  ["Comics have the exact same problem", { type: "grid", assets: [C.xmen3, C.xmen4, C.xmen5, C.xmen], columns: 4, title: "X-Men #1 (1991): one issue, five covers" }],
  ["second printings", cover(C.scud1, { treatment: "still", title: "Scud #1, second printing" })],
  ["same title relaunched five times", screen("iron-man-search", "push", "Same title. New number one.")],
  ["In my Coheed books", { type: "grid", assets: [C.ks1, C.ks2, C.ks3, C.ks4, C.ks5], columns: 5 }],
  ["Claudio Sanchez", cover(C.goodApollo1, { title: "Claudio Sanchez" })],
  ["what I was missing", cover(C.noWorld1, { treatment: "slowPull" })],

  ["So Corey", { type: "chapter", title: "The two long boxes", transitionIn: "cut" }],
  ["A long box is exactly what it sounds like", { type: "grid", assets: [C.cerebus1, C.cerebus2, C.cerebus5, C.milk1, C.milk4, C.milk5, C.scud1, C.scud4, C.scud6, C.iron, C.surfer, C.avengers], columns: 6 }],
  ["Two of them is a workout", { type: "fan", assets: BOX6 }],
  ["bagged and bordered", { type: "grid", assets: BOX6, columns: 3 }],
  ["Marvel next to image", cover(C.iron, { treatment: "still", transitionIn: "cut" })],
  ["next to something I'd never heard of", cover(C.milk1, { treatment: "still", transitionIn: "cut" })],
  ["next to an aardvark", cover(C.cerebus1, { treatment: "still", transitionIn: "cut" })],
  ["into piles", { type: "grid", assets: [C.iron, C.surfer, C.avengers, C.xmen, C.cerebus1, C.cerebus2, C.cerebus3, C.cerebus5, C.milk1, C.milk2, C.milk3, C.milk4], columns: 4, title: "By publisher. Then by series." }],
  ["this is a time capsule", { type: "grid", assets: BOX9, columns: 3 }],
  ["what a price guide says", { type: "grid", assets: [C.xmen3, C.iron, C.mantra, C.firearm, C.scud4, C.milk5], columns: 6 }],

  ["putting them in the comics catalog", { type: "chapter", title: "The easy part", transitionIn: "cut" }],
  ["Iron Man", cover(C.iron, { treatment: "still", transitionIn: "cut" })],
  ["Silver Surfer", cover(C.surfer, { treatment: "still", transitionIn: "cut" })],
  ["Avengers", cover(C.avengers, { treatment: "still", transitionIn: "cut" })],
  ["you get it", { type: "grid", assets: [C.iron, C.surfer, C.avengers], columns: 3 }],
  ["Search the title", screen("silver-surfer-series")],
  ["Next stack", screen("iron-man-series", "panDown")],
  ["looking at a run", screen("avengers-series", "panDown")],
  ["covers lined up", screen("silver-surfer-series-tall", "panDown")],
  ["I made this", screen("silver-surfer-series", "push", undefined, { focus: { x: 0.5, y: 0.7 }, zoom: 1.3 })],
  ["lasts about 10 minutes", { type: "quote", text: "That feeling lasts about ten minutes." }],

  ["the other pile", { type: "chapter", title: "The weird stuff", transitionIn: "cut" }],
  ["Cerebus", { type: "fan", assets: [C.cerebus1, C.cerebus2, C.cerebus3, C.cerebus4, C.cerebus10] }],
  ["to be exact", cover(C.cerebus1, { title: "Cerebus", sub: "Dave Sim · Aardvark-Vanaheim" })],
  ["300 issues", { type: "grid", assets: [C.cerebus1, C.cerebus2, C.cerebus3, C.cerebus4, C.cerebus5, C.cerebus6, C.cerebus7, C.cerebus8, C.cerebus10, C.cerebus20, C.cerebus26], columns: 6, title: "300 issues. 1977 to 2004." }],
  ["parody of Conan", cover(C.cerebus1, { treatment: "focus", focus: { x: 0.5, y: 0.35, zoom: 1.45 } })],
  ["bigger and a lot stranger", { type: "grid", assets: [C.cerebus5, C.cerebus6, C.cerebus7, C.cerebus8, C.cerebus20, C.cerebus26], columns: 6 }],
  ["complicated reputation", cover(C.cerebus26, { treatment: "slowPull" })],
  ["Milk and Cheese by Evan Dorkin", { type: "grid", assets: [C.milk1, C.milk2, C.milk3], columns: 3, title: "Milk & Cheese", sub: "Evan Dorkin · Slave Labor Graphics" }],
  ["Dairy products gone bad", cover(C.milk5)],
  ["A carton of milk", cover(C.milk1, { treatment: "focus", focus: { x: 0.5, y: 0.45, zoom: 1.45 } })],
  ["The first issue is number one", cover(C.milk1, { treatment: "still", title: "#1" })],
  ["other number one", cover(C.milk2, { treatment: "focus", focus: { x: 0.5, y: 0.17, zoom: 1.5 }, title: "#2: Other Number One" })],
  ["third number one", cover(C.milk3, { treatment: "focus", focus: { x: 0.5, y: 0.22, zoom: 1.5 }, title: "#3: Third Number One" })],
  ["90s vibe", { type: "grid", assets: [C.milk1, C.milk2, C.milk3, C.milk4, C.milk5, C.milk6, C.milk7], columns: 7 }],
  ["Scud the Disposable Assassin", cover(C.scud1, { title: "Scud the Disposable Assassin", sub: "Rob Schrab · Fireman Press, 1994 · #1 (2nd printing cover)" })],
  ["vending machine", cover(C.scud1, { treatment: "focus", focus: { x: 0.5, y: 0.38, zoom: 1.5 } })],
  ["blows itself up", cover(C.scud4)],
  ["target in the hospital", cover(C.scud5)],
  ["freelance work", { type: "grid", assets: [C.scud6, C.scud10, C.scud15, C.scud18], columns: 4 }],
  ["Stopped at issue 20", { type: "pair", assets: [{ asset: C.scud20, label: "#20" }, { asset: C.scud21, label: "#21 · Image, 2008" }] }],
  ["finished it at Image", cover(C.scud21)],
  ["And Malibu Malibu Comics", { type: "grid", assets: [C.prime, C.hardcase, C.strangers, C.mantra, C.firearm, C.nightMan], columns: 6, title: "The Ultraverse, 1993" }],
  ["Marvel bought the company", { type: "grid", assets: [C.freex, C.prototype, C.mantra, C.firearm], columns: 4, title: "Marvel bought Malibu, November 1994" }],
  ["where it got humbling", screen("cerebus-search")],
  ["didn't show up in search at all", screen("cerebus-series", "panDown", "Cerebus: searchable since October 5")],
  ["Malibu was basically invisible", screen("hardcase-malibu-series", "push", "Malibu: searchable since September 17")],
  ["Scud has the 2008 finale", screen("scud-search", "push", "Scud on ComixCatalog: the 2008 Image run only")],
  ["not the original 20 issues", cover(C.scud20, { title: "Fireman Press #1 to 20: not on the site yet" })],
  ["kind of embarrassing", screen("gcd-milk-and-cheese", "push", "The data was out there: Grand Comics Database")],
  ["publishers I recognized", screen("allowlist-code", "push", undefined, { focus: { x: 0.3, y: 0.35 }, zoom: 1.25 })],
  ["slave labor graphics", cover(C.milk1, { treatment: "still" })],
  ["European imprint", { type: "quote", text: "Big publisher?\nOr a European imprint?" }],

  ["So remember Discogs", { type: "chapter", title: "What changed", transitionIn: "cut" }],
  ["One guy's electronic music collection", screen("discogs-2001-home")],
  ["same trap", screen("allowlist-code", "push", undefined, { focus: { x: 0.25, y: 0.55 }, zoom: 1.4 })],
  ["a really nice website for me", screen("home")],
  ["real collections are weird", cover(C.cerebus1, { treatment: "still", transitionIn: "cut" })],
  ["Some of what I found is fixed now", screen("milk-and-cheese-series", "push", "Since recording: Milk & Cheese is on ComixCatalog")],
  ["Malibu's searchable", screen("strangers-malibu-series")],
  ["Cerebus is searchable", screen("cerebus-series")],
  ["Some of it isn't", cover(C.scud20, { title: "Still missing: Scud #1 to 20" })],
  ["that's the real test", { type: "quote", text: "That's the real test." }],
  ["Anybody can find Amazing", screen("spider-man-search")],
  ["strange little book", { type: "grid", assets: [C.cerebus1, C.milk1, C.scud1], columns: 3 }],

  ["So Corey I gotta thank you", { type: "chapter", title: "The real test", transitionIn: "cut" }],
  ["best test this website", { type: "grid", assets: BOX6, columns: 3 }],
  ["Finding stuff you didn't know existed", { type: "grid", assets: [C.milk6, C.scud10, C.cerebus20, C.freex], columns: 4 }],
  ["finishing the run", screen("cerebus-series", "panDown")],
  ["talking to other people", { type: "quote", text: "3. Talking to people who care as much as you do." }],
  ["This guy's nailed that for records", screen("discogs-homework-top", "push", undefined, { focus: { x: 0.72, y: 0.12 }, zoom: 1.5 })],
  ["The catalog and the collection part", screen("silver-surfer-series", "push", "Catalog and collection: live")],
  ["buying and selling part is in beta", screen("sell", "push", "Marketplace: beta")],
  ["no checkout yet", screen("sell", "push", "Marketplace: beta")],
  ["Facebook Marketplace", screen("marketplace")],
  ["long box of your own", { type: "grid", assets: BOX6, columns: 3 }],
  ["tell me in the comments", { type: "grid", assets: [C.cerebus1, C.milk1, C.scud1, C.mantra, C.firearm, C.nightMan], columns: 6 }],
  ["Next time", cover(C.amory, { title: "Next time: Coheed and Cambria" })],
];

const resolved = resolveAnchors(narrationWords, CUES.map(([phrase]) => phrase));
export const anchorMisses = resolved.misses;
if (anchorMisses.length) throw new Error(`episode-003: unresolved anchors:\n${anchorMisses.map((m) => `#${m.index} ${m.phrase}`).join("\n")}`);
const segments = CUES.map(([phrase, seg], i) => ({ ...seg, at: +Math.max(0, VOICE_AT + resolved.times[i] - LEAD).toFixed(3), beat: phrase }));
segments.push({ type: "sting", at: stingGap.at, beat: "Channel sting", transition: "cut" });
segments.push({ type: "end", at: +(VOICE_AT + narrationWords.at(-1).e).toFixed(3), dur: 4, beat: "Hidden Cambria", title: "What's the weirdest book in your long box?\nTell me in the comments.", transitionIn: "cut" });
segments.sort((a, b) => a.at - b.at);

export default {
  id: "episode-003", assetEpisodeId: "episode-003", outputDir: "episode-003", outputName: "episode-003", compositionId: "Episode003",
  title: config.titleOptions[0], duration: +(VOICE_AT + edited.duration + GAP_DUR + 4).toFixed(3), nudges: [], segments,
  audio: {
    narration: { asset: "audio/NARRATION_EDITED.wav", at: VOICE_AT, volume: 1, clips: narrationClips.map((clip) => ({ at: +(VOICE_AT + clip.out).toFixed(3), from: clip.from, to: clip.to })) },
    music: { asset: "audio/MUSIC_BED.mp3", volume: 0.25, fadeIn: 2, fadeOut: 4, loop: true, duck: [{ from: stingGap.at, to: stingGap.at + stingGap.dur }] },
    // Skip Funkorama's quiet intro so its first downbeat lands with the logo slam.
    sting: { asset: "audio/MUSIC_STING.mp3", at: stingGap.at, from: 7.10, dur: stingGap.dur, volume: 1, fadeOut: 0.4 },
  },
};
