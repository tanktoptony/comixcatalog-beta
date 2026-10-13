// Builds narration.edit.js for Tony's Ep 002 recording (2026-10-09 take):
// keep his last clean take of each paragraph, drop stage directions read
// aloud and off-mic moments, then shorten long pauses.
//   node episode-002/build-edit.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const load = (f) => JSON.parse(fs.readFileSync(f, "utf8").replace(/^[\s\S]*?export default /, "").replace(/;\s*$/, ""));
const T = load("episode-002/narration.words.js");
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

const KEEPS = [
  span("If you've been following", 20, "Jonathan Hickman", 21),
  [29.40, 33.60],                       // take 1: Fantastic Four, Avengers, Secret Wars, House of X,
  [48.42, 49.64],                       // take 2: Powers of X.
  [56.05, find("attention to his work", 56).e],
  span("But here's something funny", 60, "the Manhattan Project", 70),
  span("I love the covers", 110, "talk about today", 150),
  span("Real quick", 165, "doesn't go so great", 200),
  span("All of it was building", 220, "Iconic", 260),
  span("And House of X number two", 280, "before him built", 305),
  [369.93, find("going to find out", 385).e], // Whisper squashed this take's timing to zero-length words; speech starts at 370.0 (energy)
  span("All right that's Hickman", 396, "without knowing he wrote them", 397),
  span("The Manhattan Projects", 403, "on some issues", 409),
  span("You know the real Manhattan Project", 440, "The Sun Beyond the Stars", 540),
  span("East of West", 553, "what that is", 607),
  span("On top of that there's a prophecy called", 612, "help along", 626),
  span("The tagline on the series", 638, "Totally fictional", 645),
  span("If you like the data pages", 674, "very strange technology", 690),
  span("and again those covers", 714, "a whole lot of white", 714),
  span("Same confession as before", 733, "most comic book thing about it", 750),
  span("Those are the two I owned", 760, "laid out like a poster", 800),
  span("Then Pax Romana", 813, "the guy does not sit still", 890),
  span("So what ties all this together", 895, "which worlds get to live", 930),
  span("He was doing that", 944, "build a world", 950),
  span("So where do you start", 955, "I did", 993),
  span("And that's the part I keep thinking about", 1008, "the answer is everything", 1030),
];

// Pad each kept range a little (breath in, word tail out) without touching
// the neighbouring words.
const keeps = KEEPS.map(([s, e, i, j]) => {
  // Neighbours by index, not time: Whisper often ends one word on the exact
  // instant the next begins, and a time test then skips that next word.
  i ??= W.findIndex((w) => w.s >= s - 0.005);
  j ??= W.findLastIndex((w) => w.e <= e + 0.005);
  const prev = W[i - 1];
  const next = W[j + 1];
  return [+Math.max(s - 0.08, prev ? prev.e + 0.03 : 0).toFixed(3), +Math.min(e + 0.18, next ? next.s - 0.03 : T.duration).toFixed(3)];
});
// Snap every boundary to real silence in the cleaned audio. Whisper's word
// times drift by a few hundred ms (worse inside fast retakes), and a cut
// placed by them alone can clip a word's first or last syllable.
const wav = fs.readFileSync("public/episode-002/audio/NARRATION_CLEAN.wav");
const dataAt = wav.indexOf("data") + 8;
const pcm = new Int16Array(wav.buffer, wav.byteOffset + dataAt, Math.floor((wav.length - dataAt) / 2));
const SR = 48000, FR = 480; // 10 ms frames
const level = (t) => { const a = Math.max(0, Math.round(t * SR)); let q = 0; for (let k = a; k < a + FR && k < pcm.length; k++) q += (pcm[k] / 32768) ** 2; return 10 * Math.log10(q / FR + 1e-12); };
const QUIET = -38;
const snapStart = (t, floor) => { for (let d = 0; d <= 0.5; d += 0.01) { const u = t - d; if (u <= floor) break; if (level(u - 0.01) < QUIET && level(u - 0.02) < QUIET) return +(u - 0.01).toFixed(3); } return t; };
const snapEnd = (t, ceil) => { for (let d = 0; d <= 0.5; d += 0.01) { const u = t + d; if (u >= ceil) break; if (level(u) < QUIET && level(u + 0.01) < QUIET) return +(u + 0.02).toFixed(3); } return t; };
for (let k = 0; k < keeps.length; k++) {
  const floor = k ? keeps[k - 1][1] : 0, ceil = keeps[k + 1]?.[0] ?? T.duration;
  keeps[k] = [snapStart(keeps[k][0], floor), snapEnd(keeps[k][1], ceil)];
}
// Hand-checked boundaries snapping must not move: both sit inside
// continuous speech, at the only energy dip between two words.
const PINNED = {
  2: [48.38, null], // take 2 "Powers of X": starts after "and" (no silence before it)
  4: [null, 77.40], // "...the Manhattan Project." ends before a drawn-out "I..."
};
for (const [k, [a, b]] of Object.entries(PINNED)) { if (a != null) keeps[k][0] = a; if (b != null) keeps[k][1] = b; }
const cuts = [];
let cursor = 0;
for (const [s, e] of keeps) { if (s > cursor + 0.01) cuts.push([+cursor.toFixed(3), s]); cursor = e; }
if (cursor < T.duration) cuts.push([+cursor.toFixed(3), T.duration]);

// Long pauses inside kept audio: shorten anything over 0.8 s to 0.45 s.
// Measured on the cleaned file (same timing): the raw take is so quiet that
// its speech sits under find-pauses.py's -44 dBFS silence line.
const py = "../../video-ep-pipeline/video-production/.venv/Scripts/python.exe";
const out = execFileSync(py, ["scripts/find-pauses.py", "public/episode-002/audio/NARRATION_CLEAN.wav", "0", "0.8", "0.45"], { encoding: "utf8" });
const pauses = JSON.parse(out.split("\n").find((l) => l.startsWith("[")))
  .filter(([a, b]) => keeps.some(([s, e]) => a >= s && b <= e));

const kept = keeps.reduce((t, [s, e]) => t + e - s, 0) - pauses.reduce((t, [a, b]) => t + b - a, 0);
const body = { source: T.source, play: "NARRATION_CLEAN.wav", start: 0, cuts, pauses };
fs.writeFileSync("episode-002/narration.edit.js", `// Generated by episode-002/build-edit.mjs from Tony's 2026-10-09 recording.\n// ${keeps.length} kept takes, ${pauses.length} pauses shortened, ${kept.toFixed(1)} s of narration.\nexport default ${JSON.stringify(body)};\n`);
console.log(`${keeps.length} keeps, ${cuts.length} cuts, ${pauses.length} pauses -> ${(kept / 60).toFixed(2)} min of narration`);
