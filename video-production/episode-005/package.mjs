// Episode 005 upload package -> ~/Desktop/YouTube/episode-005-youtube:
// PACKAGE.md (titles, description with chapters and links, tags, pinned
// comment, Shorts copy), captions.srt (fixed spellings), and copies of the
// render, thumbnails and Shorts when they exist.
//
//   node episode-005/package.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { narrationWords } from "./timeline.js";
import { fixWords } from "./fixWords.js";
import config from "./episode.json" with { type: "json" };

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.EPISODE_PACKAGE_OUT || path.join(os.homedir(), "Desktop", "YouTube", "episode-005-youtube");
fs.mkdirSync(path.join(out, "shorts"), { recursive: true });
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// Chapters: the first word of each section that has a chapter name.
const chapters = [];
for (const s of config.sections) {
  if (!s.chapter) continue;
  const sid = s.id.slice(0, 2);
  const first = narrationWords.find((w) => w.sec === sid);
  chapters.push({ at: chapters.length ? first.s - 0.3 : 0, text: s.chapter });
}
for (let i = 1; i < chapters.length; i += 1) if (chapters[i].at - chapters[i - 1].at < 10) throw new Error(`chapters under 10 s apart: ${chapters[i - 1].text} / ${chapters[i].text}`);

// Captions: sentence-ish cues of up to ~42 characters.
const words = fixWords(narrationWords);
const cues = [];
let cur = [];
const flush = () => { if (cur.length) cues.push({ s: cur[0].s, e: cur.at(-1).e, t: cur.map((w) => w.w).join(" ") }); cur = []; };
words.forEach((w, i) => {
  const next = words[i + 1];
  cur.push(w);
  if (/[.?!]$/.test(w.w) || cur.map((x) => x.w).join(" ").length > 42 || !next || next.s - w.e > 0.6) flush();
});
const ts = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
fs.writeFileSync(path.join(out, "captions.srt"), cues.map((c, i) => `${i + 1}\n${ts(c.s)} --> ${ts(Math.max(c.e, c.s + 0.8))}\n${c.t}\n`).join("\n"));

const link = (id) => `https://www.comixcatalog.com/series/${id}?utm_source=youtube&utm_medium=video&utm_campaign=${config.utmCampaign}`;
const books = [
  ["The Bag On Line Adventures (2004)", "aa36b552-18e8-4a30-86ef-9a5cee18756a"],
  ["The Amory Wars (2007)", "f5b04bab-2a49-4d6c-afaa-71a916795fb8"],
  ["Amory Wars II (2008)", "66b2265a-588c-4d4e-8a95-8f8df40989f9"],
  ["The Second Stage Turbine Blade Ultimate Edition (2010)", "400bbc1a-3560-4e0a-afbe-f973b00f8c10"],
];
const photoCredits = "Photos via Wikimedia Commons: Coheed and Cambria live, Bogotá, 2007 (Juan Andres Martinez, CC BY-SA 2.0); Coheed and Cambria live, 2009 (HeavyMezza89, Public domain); Travis Stever, 2014 (Adam Sims, CC BY-SA 4.0); Downtown Nyack, New York (Jondude11, CC BY-SA 4.0)";
const credits = config.credits.filter((c) => !c.startsWith("Photos via")).concat(photoCredits);
const description = [
  config.descriptionIntro, "",
  "The comics in this episode:",
  ...books.flatMap(([label, id]) => [`- ${label}`, `  ${link(id)}`]), "",
  "Chapters", ...chapters.map((c) => `${mmss(c.at)} ${c.text}`), "",
  "New full episode every Sunday. Shorts Tuesday, Thursday and Saturday.", "",
  "Credits", ...credits, "",
  "#CoheedAndCambria #AmoryWars #Comics",
].join("\n");

const md = `# Episode 005 upload package

Video: episode-005.mp4 · ${mmss(narrationWords.at(-1).e + 8)} · 1920x1080
Captions: captions.srt
Publish: ${config.publish}

## Title options
${config.titleOptions.map((t, i) => `${i + 1}. ${t}`).join("\n")}

## Description
\`\`\`
${description}
\`\`\`

## Tags
${config.tags.join(", ")}

## Pinned comment
\`\`\`
${config.pinnedComment}
\`\`\`

## Shorts
${config.shorts.map((s) => `### ${s.id}\n\nTitle: ${s.title}\n\nDescription:\n${s.description}\n\nSuggested time: ${s.schedule}\n`).join("\n")}`;
fs.writeFileSync(path.join(out, "PACKAGE.md"), md);

const copy = (from, to) => { if (fs.existsSync(from)) { fs.copyFileSync(from, to); return true; } return false; };
const o = path.join(here, "output");
const copied = [
  copy(path.join(o, "episode-005.mp4"), path.join(out, "episode-005.mp4")) && "episode-005.mp4",
  ...["Thumb005TenSongs", "Thumb005NameNames"].map((t) => copy(path.join(o, "thumbnails", `${t}.png`), path.join(out, `thumbnail-${t}.png`)) && t),
  ...config.shorts.map((s) => copy(path.join(o, "shorts", `${s.id}.mp4`), path.join(out, "shorts", `${s.id}.mp4`)) && s.id),
].filter(Boolean);
console.log(`wrote ${out}: PACKAGE.md, captions.srt (${cues.length} cues), ${chapters.length} chapters; copied ${copied.join(", ") || "nothing yet"}`);
