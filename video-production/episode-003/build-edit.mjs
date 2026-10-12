// Builds narration.edit.js for Tony's Ep 003 recording (OBS, 2026-10-09
// 20:06): keep his last clean take of each paragraph, drop the paragraph
// numbers and directions he read aloud ("P13, done over", "Scratch that last
// line"), then shorten long pauses. Same method as episode-002/build-edit.mjs.
//   node episode-003/build-edit.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const load = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^[\s\S]*?export default /, "").replace(/;\s*$/, ""));
const T = load("episode-003/narration.words.js");
const W = T.words.map((w) => ({ ...w, n: w.w.toLowerCase().replace(/[^a-z0-9]/g, "") })).filter((w) => w.n);
const norm = (p) => p.toLowerCase().split(/\s+/).map((x) => x.replace(/[^a-z0-9]/g, "")).filter(Boolean);

function find(phrase, after) {
  const p = norm(phrase);
  for (let i = 0; i < W.length; i++) {
    if (W[i].s < after) continue;
    if (p.every((t, k) => W[i + k]?.n === t)) return { s: W[i].s, e: W[i + p.length - 1].e, i, j: i + p.length - 1 };
  }
  throw new Error(`not found: "${phrase}" after ${after}`);
}
const span = (from, fa, to, ta) => { const a = find(from, fa), b = find(to, ta ?? fa); return [a.s, b.e, a.i, b.j]; };

// Paragraph numbers are SCRIPT.md's. Times are where Whisper heard the take.
export const KEEPS = [
  span("A friend of mine recently", 44, "handle a real collection", 60),            // P1-P5 cold open (the sting goes after this)
  span("But before I get into that", 79, "obsessed with an idea", 91),              // P6-P8
  span("could catalog his records", 101, "everything was worth", 109),              // P9, take 2 ("He" is glued to take 1 in the transcript; pinned below)
  span("And I remember thinking", 113, "compare listings and buy it", 125),         // P10-P12
  span("I was just starting my master's in", 139, "adding what they own", 181),     // P13 take 2 through P19
  span("Here's something I didn't know until I started", 195, "all you get for now", 248), // P20 take 2 through P22
  span("So Corey", 252, "then by series", 288),                                     // P23-P27
  span("And somewhere in there it hit me", 295, "it actually works", 332),          // P28 take 2 through P31
  span("If you've ever built anything", 344, "conversation for another day", 384),  // P32-P34
  span("Milk and Cheese by Evan", 389, "90s vibe", 412),                            // P35, ends on "...90s vibe" as Tony directed
  span("Scud the Disposable Assassin", 430, "Image in 2008", 455),                  // P36
  span("And Malibu Malibu Comics", 474, "company in 1994", 480),                    // P37, take 3
  span("And this is where it got humbling", 488, "humbling", 488),                  // P39
  span("Cerebus the most famous", 499, "publishers I recognized", 520),             // P40-P41, take 2
  span("And I know a lot about the X Men", 530, "or something different", 540),     // P41 end, take 2, plus his P42 line
  span("So remember Discogs", 548, "collectors actually own", 557),                 // P43-P44
  span("And real collections are weird", 570, "has ever had", 601),                 // P44 take 2 through P47
  span("For me collecting has always", 616, "better than Facebook Marketplace", 646), // P48 take 2, P49
  span("so if you've got a long box", 655, "Cambria", 668),                         // P50 take 2, P51
];

// Pad each kept range a little (breath in, word tail out) without touching
// the neighbouring words.
const keeps = KEEPS.map(([s, e, i, j]) => {
  const prev = W[i - 1];
  const next = W[j + 1];
  return [+Math.max(s - 0.08, prev ? prev.e + 0.03 : 0).toFixed(3), +Math.min(e + 0.18, next ? next.s - 0.03 : T.duration).toFixed(3)];
});
// Snap every boundary to real silence in the leveled audio (same timing as
// the raw take). Whisper's word times drift by a few hundred ms, worst inside
// fast retakes, and a cut placed by them alone can clip a syllable.
const wav = fs.readFileSync("public/episode-003/audio/NARRATION_LEVELED.wav");
const dataAt = wav.indexOf("data") + 8;
const pcm = new Int16Array(wav.buffer, wav.byteOffset + dataAt, Math.floor((wav.length - dataAt) / 2));
const SR = 48000, FR = 480; // 10 ms frames
const level = (t) => { const a = Math.max(0, Math.round(t * SR)); let q = 0; for (let k = a; k < a + FR && k < pcm.length; k++) q += (pcm[k] / 32768) ** 2; return 10 * Math.log10(q / FR + 1e-12); };
// Leveled speech sits around -15 dBFS RMS and the floor between words around
// -65 to -75, so -50 is clear of both breaths' peaks and the floor.
const QUIET = -50;
const snapStart = (t, floor) => { for (let d = 0; d <= 0.5; d += 0.01) { const u = t - d; if (u <= floor) break; if (level(u - 0.01) < QUIET && level(u - 0.02) < QUIET) return +(u - 0.01).toFixed(3); } return t; };
const snapEnd = (t, ceil) => { for (let d = 0; d <= 0.5; d += 0.01) { const u = t + d; if (u >= ceil) break; if (level(u) < QUIET && level(u + 0.01) < QUIET) return +(u + 0.02).toFixed(3); } return t; };
for (let k = 0; k < keeps.length; k++) {
  const floor = k ? keeps[k - 1][1] : 0, ceil = keeps[k + 1]?.[0] ?? T.duration;
  keeps[k] = [snapStart(keeps[k][0], floor), snapEnd(keeps[k][1], ceil)];
}
// Hand-checked against the audio energy; snapping must not move these.
const PINNED = {
  0: [44.18, null],   // cold open: leave 0.1 s of room before the first word
  1: [79.45, null],   // "But before": a short mouth noise at 79.0-79.1, real onset 79.6
  2: [101.60, null],  // P9 take 2 "He" starts at 101.65 (energy + medium.en); 101.05-101.6 is a breath
  10: [431.30, null], // Scud: false start "Scud the..." 430.28-431.08, clean take from 431.44
  12: [null, 490.98],  // "humbling" decays out by 490.96; the murmur at 491.0-491.8 is not a word
  13: [499.30, null], // "Cerebus" take 2: the false start runs 494.2-498.7, silence until 499.35
};
for (const [k, [a, b]] of Object.entries(PINNED)) { if (a != null) keeps[k][0] = a; if (b != null) keeps[k][1] = b; }
const cuts = [];
let cursor = 0;
for (const [s, e] of keeps) { if (s > cursor + 0.01) cuts.push([+cursor.toFixed(3), s]); cursor = e; }
if (cursor < T.duration) cuts.push([+cursor.toFixed(3), T.duration]);

// Lines that stopped being true after the recording. Milk & Cheese went live
// on ComixCatalog (Slave Labor, 7 issues) between 10-09 and 10-12, so "as I'm
// recording this, Milk and Cheese still isn't on ComixCatalog" and "Milk and
// Cheese is still on the list" come out. Set to "keep" to put them back (the
// timeline then needs an on-screen update card at both spots).
const MILK_CHEESE_LINES = "cut";
const DROPS = MILK_CHEESE_LINES === "cut" ? [
  ["And as I'm recording this", 509, "Scud has the 2008", 512],
  ["Milk and Cheese is still on the list", 581, "And honestly that's the real test", 586],
] : [];
for (const [from, fa, next, na] of DROPS) {
  const a = find(from, fa), b = find(next, na);
  // From the dropped sentence's breath-in to the next sentence's breath-in,
  // so the pause before the dropped line becomes the pause before the next.
  cuts.push([snapStart(+(a.s - 0.08).toFixed(3), W[a.i - 1].e), snapStart(+(b.s - 0.08).toFixed(3), W[b.i - 1].e)]);
}
cuts.sort((x, y) => x[0] - y[0]);

// Long pauses inside kept audio: shorten anything over 0.8 s to 0.45 s.
const py = "../../video-ep-pipeline/video-production/.venv/Scripts/python.exe";
const out = execFileSync(py, ["scripts/find-pauses.py", "public/episode-003/audio/NARRATION_LEVELED.wav", "0", "0.8", "0.45"], { encoding: "utf8" });
const pauses = JSON.parse(out.split("\n").find((l) => l.startsWith("[")))
  .filter(([a, b]) => keeps.some(([s, e]) => a >= s && b <= e));

const dropped = cuts.filter(([a, b]) => keeps.some(([s, e]) => a >= s && b <= e)).reduce((t, [a, b]) => t + b - a, 0);
const kept = keeps.reduce((t, [s, e]) => t + e - s, 0) - pauses.reduce((t, [a, b]) => t + b - a, 0) - dropped;
const body = { source: T.source, play: "NARRATION_LEVELED.wav", start: 0, cuts, pauses };
fs.writeFileSync("episode-003/narration.edit.js", `// Generated by episode-003/build-edit.mjs from Tony's 2026-10-09 20:06 recording.\n// ${keeps.length} kept takes, ${pauses.length} pauses shortened, ${kept.toFixed(1)} s of narration.\nexport default ${JSON.stringify(body)};\n`);
fs.writeFileSync("episode-003/transcript/keeps.json", JSON.stringify(keeps));
console.log(`${keeps.length} keeps, ${cuts.length} cuts, ${pauses.length} pauses -> ${(kept / 60).toFixed(2)} min of narration`);
