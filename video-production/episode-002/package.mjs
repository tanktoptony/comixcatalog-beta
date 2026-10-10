// Episode 002 upload package: ~/Desktop/episode-002-youtube/PACKAGE.md and
// captions.srt, timed from the rendered timeline and Tony's edited narration.
//   node episode-002/package.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ep, { narrationWords } from "./timeline.js";
import config from "./episode.json" with { type: "json" };

const VOICE_AT = 0.8;
const out = path.join(os.homedir(), "Desktop", "episode-002-youtube");
fs.mkdirSync(out, { recursive: true });
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// Chapters start where each section's first shot starts.
const CHAPTERS = [
  ["following Marvel comics for the last decade", "Intro"],
  ["the Marvel side", "Hickman, the Marvel guy"],
  ["Image Comics started in 2012", "The Manhattan Projects"],
  ["East of West Also Image", "East of West"],
  ["Those are the two I owned", "The Nightly News, Pax Romana, Black Monday Murders"],
  ["what ties all this together", "What ties it all together"],
  ["So where do you start", "Where to start"],
  ["That's the part I keep thinking about", "Already in the long box"],
];
const chapters = CHAPTERS.map(([beat, label], i) => {
  const seg = ep.segments.find((s) => s.beat === beat);
  if (!seg) throw new Error(`chapter beat not found: ${beat}`);
  return `${mmss(i === 0 ? 0 : seg.at)} ${label}`;
});

// Whisper's spellings -> what Tony said.
const FIXES = [
  [/Asad Rivek/g, "Esad Ribić"], [/Pepe La Raza/g, "Pepe Larraz"], [/R \.B\./g, "R.B."], [/Nick Patara/g, "Nick Pitarra"],
  [/Ryan Brown\b/g, "Ryan Browne"], [/\bLeka\b/g, "Laika"], [/\bmobius\b/gi, "Moebius"], [/Jeff Darrow/g, "Geof Darrow"],
  [/Frank Quietly/g, "Frank Quitely"], [/Nick Dragata/g, "Nick Dragotta"], [/Russ Woodman/g, "Rus Wooton"],
  [/a common hits/g, "a comet hits"], [/Regatta's/g, "Dragotta's"], [/East -west|East West|East to West|east -west/g, "East of West"],
  [/also imaged/g, "also Image,"], [/Pox Romana/g, "Pax Romana"], [/the quorum/g, "Decorum"], [/Tom Coker/g, "Tomm Coker"],
  [/garbage pa(le|il) kids/gi, "Garbage Pail Kids"], [/McTaggart/g, "MacTaggert"], [/ -/g, "-"], [/5 ,000/g, "5,000"],
  [/Manhattan projects/g, "Manhattan Projects"], [/Werner von/g, "Wernher von"], [/Years have set up/g, "Years of setup"],
  [/and so pretty recently/g, "until pretty recently"], [/that seven nations/g, "the Seven Nations"], [/A piece together/g, "Pieced together"],
  [/Doctor Strange and (the )?Multiverse/g, "Doctor Strange in the Multiverse"], [/thrashing/g, "trashing"],
  [/^started at the beginning/m, "Start at the beginning"], [/nightly news/gi, "Nightly News"], [/the chosen/g, "the Chosen"],
  [/death has gone/g, "Death has gone"], [/four horsemen of the apocalypse/g, "Four Horsemen of the Apocalypse"],
];

// Captions: up to ~42 characters per line, break on sentence ends and pauses.
const cues = [];
let cur = [];
const push = () => { if (cur.length) cues.push({ s: cur[0].s, e: cur.at(-1).e, t: cur.map((w) => w.w).join(" ") }); cur = []; };
narrationWords.forEach((w, i) => {
  const next = narrationWords[i + 1];
  cur.push(w);
  const len = cur.map((x) => x.w).join(" ").length;
  if (/[.?!]$/.test(w.w) || len > 38 || !next || next.s - w.e > 0.6) push();
});
const ts = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const fix = (t, start) => { const x = FIXES.reduce((y, [a, b]) => y.replace(a, b), t); return start ? x.replace(/^./, (c) => c.toUpperCase()) : x; };
const srt = cues.map((c, i) => `${i + 1}\n${ts(c.s + VOICE_AT)} --> ${ts(Math.max(c.e, c.s + 0.8) + VOICE_AT)}\n${fix(c.t)}\n`).join("\n");
fs.writeFileSync(path.join(out, "captions.srt"), srt);

const utm = (p = "") => `https://www.comixcatalog.com${p}?utm_source=youtube&utm_medium=video&utm_campaign=${config.utmCampaign}`;
const description = `${config.descriptionIntro}

The starter shelf:
- East of West, Vol. 1: The Promise (issues 1 to 5). Finished, 45 issues.
- The Manhattan Projects, Vol. 1: Science Bad (issues 1 to 5)
- The Nightly News (6 issues, Hickman's first comic)
- Pax Romana (4 issues)
- The Black Monday Murders (8 issues, on hiatus since 2018)

Track your collection on ComixCatalog: ${utm()}

Chapters
${chapters.join("\n")}

Credits
Comic covers and interior art are the property of Image Comics, Marvel, and their creators (Jonathan Hickman, Nick Pitarra, Ryan Browne, Nick Dragotta, Frank Martin, Rus Wooton, Tomm Coker, Esad Ribić, Pepe Larraz, R.B. Silva and others), shown for commentary and review. Interior images via Comic Book Herald, ComicsAlliance, and Jonathan Hickman's own Pax Romana preview.
Music: "Rollin at 5" and "Funkorama" by Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License. http://creativecommons.org/licenses/by/4.0/

#JonathanHickman #Comics #EastOfWest #ManhattanProjects`;

const md = `# Episode 002 upload package

Video: \`episode-002.mp4\` (in this folder) · ${mmss(ep.duration)} · 1920x1080
Captions: \`captions.srt\` (upload as English captions)

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
${config.pinnedComment.replace("{{startUrl}}", utm())}
\`\`\`

## Upload checklist
- [ ] Upload as Unlisted first, watch it through once
- [ ] Title, description, tags pasted
- [ ] captions.srt uploaded (English)
- [ ] Thumbnail set
- [ ] End screen: subscribe + Episode 001 on the right half (the end card leaves it clear)
- [ ] Add to the channel's episode playlist
- [ ] Public, then pin the comment
`;
fs.writeFileSync(path.join(out, "PACKAGE.md"), md);
console.log(`wrote ${out}: PACKAGE.md, captions.srt (${cues.length} cues)\n` + chapters.join("\n"));
