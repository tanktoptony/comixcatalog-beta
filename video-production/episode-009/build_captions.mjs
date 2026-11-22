// captions.srt for Episode 009 from the program's word timings
// (narration.words.js, written by build_audio.py) plus a ♪ cue over each song
// clip (audio-plan.json). Captions use the real spellings (build_voice.py
// DISPLAY), never the clone's respellings.
//
//   node episode-009/build_captions.mjs [out.srt]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import words from "./narration.words.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const plan = JSON.parse(fs.readFileSync(path.join(HERE, "audio-plan.json"), "utf8"));
const out = process.argv[2] ?? path.join(os.homedir(), "Desktop", "YouTube", "episode-009-youtube", "captions.srt");
const MAX_LINE = 42;
const MAX_DUR = 6.0;

const srt = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// Sentences first (sentence end or a pause over 0.6 s), then split any sentence
// too long for one cue at the most balanced point, preferring a comma, so no
// cue is left with an orphan like "Earth: 3."
const sentences = [];
let cur = [];
for (const [i, w] of words.words.entries()) {
  if (cur.length && w.s - cur[cur.length - 1].e > 0.6) { sentences.push(cur); cur = []; }
  cur.push(w);
  if (/[.?!]["”]?$/.test(w.w) && !/^(Mr|Dr|St|vs)\.$/.test(w.w)) { sentences.push(cur); cur = []; }
}
if (cur.length) sentences.push(cur);
const join = (ws) => ws.map((w) => w.w).join(" ");
const fits = (ws) => join(ws).length <= MAX_LINE * 2 && ws[ws.length - 1].e - ws[0].s <= MAX_DUR;
function split(ws) {
  if (ws.length < 2 || fits(ws)) return [ws];
  let best = null;
  for (let k = 1; k < ws.length; k++) {
    const a = ws.slice(0, k), b = ws.slice(k);
    const score = Math.abs(join(a).length - join(b).length) - (/[,;:]$/.test(ws[k - 1].w) ? 25 : 0) + (k < 2 || ws.length - k < 2 ? 100 : 0);
    if (!best || score < best.score) best = { score, k };
  }
  return [...split(ws.slice(0, best.k)), ...split(ws.slice(best.k))];
}
// Years are written out for the voice ("two thousand three"); captions show digits.
const UNITS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const years = (t) => t.replace(/\btwo thousand(?: and)? (\w+)\b/gi, (m, u) => (UNITS[u.toLowerCase()] ? String(2000 + UNITS[u.toLowerCase()]) : m));
const cues = sentences.flatMap(split).map((ws) => ({ s: ws[0].s, e: ws[ws.length - 1].e, text: years(join(ws)) }));

// Two balanced lines per cue.
const wrap = (t) => {
  if (t.length <= MAX_LINE) return t;
  const ws = t.split(" ");
  let best = null;
  for (let k = 1; k < ws.length; k++) {
    const a = ws.slice(0, k).join(" "), b = ws.slice(k).join(" ");
    const score = Math.max(a.length, b.length);
    if (!best || score < best.score) best = { score, t: `${a}\n${b}` };
  }
  return best.t;
};

const TITLES = {
  ring: "The Ring in Return", title_open: "In Keeping Secrets of Silent Earth: 3", title_mid: "In Keeping Secrets of Silent Earth: 3",
  cuts: "Cuts Marked in the March of Men", evils: "Three Evils (Embodied in Love and Shadow)", crowing: "The Crowing", brs: "Blood Red Summer",
  camper1: "The Camper Velourium I: Faint of Hearts", camper2: "The Camper Velourium II: Backend of Forever", camper3: "The Camper Velourium III: Al the Killer",
  afha: "A Favor House Atlantic", light: "The Light & the Glass", 2113: "21:13",
};
const music = (plan.clips ?? []).map((c) => ({ s: c.at, e: c.at + c.dur, text: `♪ ${c.title ?? TITLES[c.song] ?? c.song} ♪` }));
const all = [...cues.map((c) => ({ ...c, text: wrap(c.text) })), ...music].sort((a, b) => a.s - b.s);
// Hold each cue until the next one (max +0.8 s) so text doesn't flash.
for (let i = 0; i < all.length; i++) all[i].e = Math.min(all[i].e + 0.8, all[i + 1]?.s ?? all[i].e + 0.8);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, all.map((c, i) => `${i + 1}\n${srt(c.s)} --> ${srt(c.e)}\n${c.text}\n`).join("\n"), "utf8");
console.log(`${all.length} cues (${music.length} song clips) -> ${out}`);
