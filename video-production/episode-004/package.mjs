import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import ep, { narrationWords, stingGap } from "./timeline.js";
import config from "./episode.json" with { type: "json" };

const VOICE_AT = 0.8;
const out = process.env.EPISODE_PACKAGE_OUT || path.join(os.homedir(), "Desktop", "YouTube", "episode-004-youtube");
fs.mkdirSync(out, { recursive: true });
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const CHAPTERS = [
  [null, "The Amory Wars, Part 1"],
  ["In the fall of 2002", "Where it started"],
  ["Before there was", "The Shabütie era"],
  ["By 2002", "The Second Stage Turbine Blade"],
  ["In 2003", "When the music wasn't enough"],
  ["Another unusual piece", "The comics and their revisions"],
  ["Because we're not simply", "A universe that grew up"],
  ["First there's Heaven's Fence", "Heaven's Fence"],
  ["It's been nearly 25 years", "Why this series"],
];
const chapterRows = CHAPTERS.map(([beat, label], i) => {
  const at = i === 0 ? 0 : ep.segments.find((seg) => seg.beat === beat)?.at;
  if (at == null) throw new Error(`chapter beat not found: ${beat}`);
  return { at, text: `${mmss(at)} ${label}` };
});
for (let i = 1; i < chapterRows.length; i += 1) if (chapterRows[i].at - chapterRows[i - 1].at < 10) throw new Error(`chapters less than 10 seconds apart: ${chapterRows[i - 1].text} / ${chapterRows[i].text}`);
const chapters = chapterRows.map((row) => row.text);

const FIXES = [
  [/\b(?:the )?comics catalog\b/gi, "ComixCatalog"], [/co\s*-?\s*heat(?:ing)?(?: in)? Cambria/gi, "Coheed and Cambria"], [/\bco\s*-?\s*heating\b/gi, "Coheed"], [/\bco\s*-?\s*heat\b/gi, "Coheed"],
  [/Kilgan(?:an|on)/gi, "Kilgannon"], [/Shab(?:ootie|uti)/gi, "Shabütie"], [/Bag Online/gi, "Bag On Line"], [/\bVaxus\b/gi, "Vaxis"], [/\bSteever\b/gi, "Stever"], [/\bAmbulina\b/gi, "Ambellina"], [/\bPrese\b/g, "Prise"],
  [/second\s*-?\s*stage turbine blade/gi, "The Second Stage Turbine Blade"], [/second\s*-?\s*stage/gi, "Second Stage"], [/In Keeping Secrets of Silent Earth(?: Three| 3)?/gi, "In Keeping Secrets of Silent Earth: 3"],
  [/Good Apollo,? I'?m Burning Star (?:Four|4)/gi, "Good Apollo, I'm Burning Star IV"], [/Heaven'?s Fence/gi, "Heaven's Fence"], [/\bkey work\b/gi, "Keywork"], [/William Ryan/gi, "Wilhelm Ryan"],
  [/Claudio Sanch(?:ez|es)/gi, "Claudio Sanchez"], [/Travis Stev(?:er|ens)/gi, "Travis Stever"], [/Wes Abbot\b/gi, "Wes Abbott"], [/hot topic/gi, "Hot Topic"], [/purdue/gi, "Purdue"], [/Egyptian room/gi, "Egyptian Room"],
  [/The back end of forever/gi, "The Backend of Forever"], [/year of the black rainbow/gi, "Year of the Black Rainbow"], [/the afterman/gi, "The Afterman"], [/\bvaxis\b/gi, "Vaxis"],
];
const fix = (text) => FIXES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
const captionWords = narrationWords.map((word) => ({ ...word }));
for (let i = 0; i < captionWords.length - 1; i += 1) {
  if (/^co$/i.test(captionWords[i].w) && /^-?heat(?:ing)?$/i.test(captionWords[i + 1].w)) {
    captionWords[i].w = "Coheed";
    captionWords[i + 1].w = "";
  }
  if (/^second$/i.test(captionWords[i].w) && /^-?stage$/i.test(captionWords[i + 1].w)) {
    captionWords[i].w = "The Second Stage";
    captionWords[i + 1].w = "";
  }
}
const cues = [];
let current = [];
const push = () => { if (current.length) cues.push({ s: current[0].s, e: current.at(-1).e, t: current.map((w) => w.w).join(" ") }); current = []; };
captionWords.forEach((word, i) => {
  const next = captionWords[i + 1];
  if (!word.w) return;
  current.push(word);
  const len = current.map((x) => x.w).join(" ").length;
  if (/[.?!]$/.test(word.w) || len > 38 || !next || next.s - word.e > .6) push();
});
if (cues.some((cue) => cue.s + VOICE_AT < stingGap.at && cue.e + VOICE_AT > stingGap.at + stingGap.dur)) throw new Error("caption cue straddles channel sting");
const ts = (time) => { const ms = Math.round(time * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const captionTextFor = (cue, i) => { const text = fix(cue.t); return i === 0 || /[.?!]$/.test(cues[i - 1].t.trim()) ? text.replace(/^./, (char) => char.toUpperCase()) : text; };
const srt = cues.map((cue, i) => `${i + 1}\n${ts(cue.s + VOICE_AT)} --> ${ts(Math.max(cue.e, cue.s + .8) + VOICE_AT)}\n${captionTextFor(cue, i)}\n`).join("\n");
const captionText = cues.map(captionTextFor).join("\n");
const WRONG = [/\bcomics catalog\b/i, /co\s*-?\s*heat/i, /Kilgan(?:an|on)/i, /Shab(?:ootie|uti)/i, /Bag Online/i, /\bVaxus\b/i, /\bSteever\b/i, /\bAmbulina\b/i, /\bPrese\b/, /second\s+-stage turbine blade/i, /Good Apollo,? I'?m Burning Star Four/i, /\bkey work\b/i, /William Ryan/i, /Wes Abbot\b/i, /The back end of forever/i];
const remaining = WRONG.filter((pattern) => pattern.test(captionText));
if (remaining.length) throw new Error(`caption fixes incomplete: ${remaining.join(", ")}`);
fs.writeFileSync(path.join(out, "captions.srt"), srt);

const photoCredits = JSON.parse(fs.readFileSync("episode-004/photo-credits.json", "utf8"))
  .map((p) => `${p.shows} (${p.author.replace(/^Nightscream$/, "Luigi Novi")}, ${p.license})`).filter((v, i, a) => a.indexOf(v) === i).join("; ");
const utm = (url) => `${url}?utm_source=youtube&utm_medium=video&utm_campaign=${config.utmCampaign}`;
const description = `${config.descriptionIntro}

In this episode:
- The Bag On Line Adventures
  ${utm("https://www.comixcatalog.com/series/aa36b552-18e8-4a30-86ef-9a5cee18756a")}
- The Amory Wars, 2007
  ${utm("https://www.comixcatalog.com/series/f5b04bab-2a49-4d6c-afaa-71a916795fb8")}
- No World for Tomorrow, 2024
  ${utm("https://www.comixcatalog.com/series/aae10bf8-8c05-4486-a1e6-9736124296d7")}

Chapters
${chapters.join("\n")}

Credits
${config.credits.join("\n")}
Photos via Wikimedia Commons: ${photoCredits}

#CoheedAndCambria #AmoryWars #Comics`;
if (description.includes("—")) throw new Error("description contains an em dash");
const shorts = config.shorts.map((short) => `### ${short.id}\n\nTitle: ${short.title}\n\nDescription:\n${short.description}\n\nSuggested time: ${short.schedule}`).join("\n\n");
const md = `# Episode 004 upload package

Video: episode-004.mp4 · ${mmss(ep.duration)} · 1920x1080
Captions: captions.srt

## Title options
${config.titleOptions.map((title, i) => `${i + 1}. ${title}`).join("\n")}

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
${shorts}
`;
const packagePath = path.join(out, "PACKAGE.md");
const hashPath = path.join(out, ".package-hash");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const packageIsSafe = !fs.existsSync(packagePath) || (fs.existsSync(hashPath) && sha256(fs.readFileSync(packagePath)) === fs.readFileSync(hashPath, "utf8").trim());
const packageName = packageIsSafe ? "PACKAGE.md" : "PACKAGE.generated.md";
fs.writeFileSync(path.join(out, packageName), md);
if (packageIsSafe) fs.writeFileSync(hashPath, `${sha256(md)}\n`);
if (packageName !== "PACKAGE.md") console.log("PACKAGE.md has no matching .package-hash and may be hand-edited; wrote PACKAGE.generated.md instead.");
console.log(`wrote ${out}: ${packageName}, captions.srt (${cues.length} cues)\n${chapters.join("\n")}`);
