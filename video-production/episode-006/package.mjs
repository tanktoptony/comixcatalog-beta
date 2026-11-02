// Episode 006 upload package -> ~/Desktop/YouTube/episode-006-youtube:
// PACKAGE.md (titles, description with chapters and links, tags, pinned
// comment, Shorts copy), captions.srt, and copies of the render, thumbnails
// and Shorts when they exist.
//
//   node episode-006/package.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { narrationWords } from "./timeline.js";
import plan from "./audio-plan.json" with { type: "json" };
import config from "./episode.json" with { type: "json" };

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.env.EPISODE_PACKAGE_OUT || path.join(os.homedir(), "Desktop", "YouTube", "episode-006-youtube");
fs.mkdirSync(path.join(out, "shorts"), { recursive: true });
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// Chapters: each named section starts where its file starts (0.3 s of lead before the first word).
const chapters = [];
for (const s of config.sections) {
  if (!s.chapter) continue;
  const sec = plan.sections.find((x) => x.section === s.id);
  chapters.push({ at: chapters.length ? sec.at : 0, text: s.chapter });
}
for (let i = 1; i < chapters.length; i += 1) if (chapters[i].at - chapters[i - 1].at < 10) throw new Error(`chapters under 10 s apart: ${chapters[i - 1].text} / ${chapters[i].text}`);

// Captions: sentence-ish cues of up to ~42 characters.
const cues = [];
let cur = [];
const flush = () => { if (cur.length) cues.push({ s: cur[0].s, e: cur.at(-1).e, t: cur.map((w) => w.w).join(" ") }); cur = []; };
narrationWords.forEach((w, i) => {
  const next = narrationWords[i + 1];
  cur.push(w);
  if (/[.?!]$/.test(w.w) || cur.map((x) => x.w).join(" ").length > 42 || !next || next.s - w.e > 0.6) flush();
});
const ts = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
fs.writeFileSync(path.join(out, "captions.srt"), cues.map((c, i) => `${i + 1}\n${ts(c.s)} --> ${ts(Math.max(c.e, c.s + 0.8))}\n${c.t}\n`).join("\n"));

const link = (id) => `https://www.comixcatalog.com/series/${id}?utm_source=youtube&utm_medium=video&utm_campaign=${config.utmCampaign}`;
const description = [
  config.descriptionIntro, "",
  "The comics in this episode:",
  ...config.books.flatMap(([label, id]) => [`- ${label}`, `  ${link(id)}`]), "",
  "Chapters", ...chapters.map((c) => `${mmss(c.at)} ${c.text}`), "",
  "New full episode every Sunday. Shorts Tuesday, Thursday and Saturday.", "",
  "Credits", ...config.credits, "",
  "#DoctorDoom #Marvel #Comics",
].join("\n");

const md = `# Episode 006 upload package · The Power Index · Power Profile #001: Doctor Doom

Video: episode-006.mp4 · ${mmss(plan.duration)} · 1920x1080
Captions: captions.srt
Publish: ${config.publish}

Check before publishing: the narration is your HeyGen voice clone. In YouTube Studio's "Altered or synthetic content" question, answer the way you did for Ep 004 and 005 (same setup).

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
const thumbs = fs.existsSync(path.join(o, "thumbnails")) ? fs.readdirSync(path.join(o, "thumbnails")).filter((f) => /^Thumb006.*\.png$/.test(f)) : [];
const copied = [
  copy(path.join(o, "episode-006.mp4"), path.join(out, "episode-006.mp4")) && "episode-006.mp4",
  ...thumbs.map((f) => copy(path.join(o, "thumbnails", f), path.join(out, `thumbnail-${f}`)) && f),
  ...config.shorts.map((s) => copy(path.join(o, "shorts", `${s.id}.mp4`), path.join(out, "shorts", `${s.id}.mp4`)) && s.id),
].filter(Boolean);
console.log(`wrote ${out}: PACKAGE.md, captions.srt (${cues.length} cues), ${chapters.length} chapters; copied ${copied.join(", ") || "nothing yet"}`);
