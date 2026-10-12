// Episode 003 YouTube package. The timeline's exported words already include
// the 2.5 second channel-sting gap.
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import ep, { narrationWords, stingGap } from "./timeline.js";
import config from "./episode.json" with { type: "json" };

const VOICE_AT = 0.8;
const out = process.env.EPISODE_PACKAGE_OUT || path.join(os.homedir(), "Desktop", "YouTube", "episode-003-youtube");
fs.mkdirSync(out, { recursive: true });
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const CHAPTERS = [
  [null, "Two long boxes"],
  ["But before I get into that", "Why I built it"],
  ["If you've never used discogs", "Why Discogs works"],
  ["So Corey", "The two long boxes"],
  ["putting them in the comics catalog", "The easy part"],
  ["the other pile", "The weird stuff"],
  ["So remember Discogs", "What changed"],
  ["So Corey I gotta thank you", "The real test"],
];
const chapterRows = CHAPTERS.map(([beat, label], i) => {
  const at = i === 0 ? 0 : ep.segments.find((seg) => seg.beat === beat)?.at;
  if (at == null) throw new Error(`chapter beat not found: ${beat}`);
  return { at, text: `${mmss(at)} ${label}` };
});
for (let i = 1; i < chapterRows.length; i += 1) {
  if (chapterRows[i].at - chapterRows[i - 1].at < 10) throw new Error(`chapters less than 10 seconds apart: ${chapterRows[i - 1].text} / ${chapterRows[i].text}`);
}
const chapters = chapterRows.map((x) => x.text);

const FIXES = [
  [/\b(?:the )?comics catalog\b/gi, "ComixCatalog"], [/\bdiscogs\b/gi, "Discogs"], [/co -hidden Cambria/gi, "Coheed and Cambria"], [/called Hidden Cambria/gi, "Coheed and Cambria"],
  [/In my Coheed books for the perfect example/gi, "And my Coheed books were the perfect example"], [/comics to tell you/gi, "comics that tell you"], [/The collector is adding/g, "The collectors adding"],
  [/Everyone starting over/g, "Every one starting over"], [/new stand -and -direct/gi, "newsstand and direct"], [/new stand/gi, "newsstand"], [/-and -direct/gi, "and direct"], [/bagged and bordered/gi, "bagged and boarded"],
  [/next to image/gi, "next to Image"], [/and image runs/gi, "and Image runs"], [/\bCory\b/g, "Corey"], [/Dave Sims,/g, "Dave Sim's"],
  [/Cerebus the aardvark/g, "Cerebus the Aardvark"], [/aardvark Vanneheim/gi, "Aardvark-Vanaheim"], [/starring in aardvark/gi, "starring an aardvark"],
  [/Rob Strad/g, "Rob Schrab"], [/\bShrab\b/g, "Schrab"], [/slave labor graphics/gi, "Slave Labor Graphics"], [/other number one/gi, "Other Number One"],
  [/third number one/gi, "Third Number One"], [/smart ass/gi, "smart-ass"], [/R &B/g, "R&B"], [/This guy's nailed/g, "Discogs nailed"], [/ -/g, "-"],
];
const fix = (text) => FIXES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
const cues = [];
let current = [];
const push = () => { if (current.length) cues.push({ s: current[0].s, e: current.at(-1).e, t: current.map((w) => w.w).join(" ") }); current = []; };
narrationWords.forEach((word, i) => {
  const next = narrationWords[i + 1];
  current.push(word);
  const len = current.map((x) => x.w).join(" ").length;
  if (/[.?!]$/.test(word.w) || len > 38 || !next || next.s - word.e > 0.6) push();
});
const gapStart = stingGap.at;
const gapEnd = stingGap.at + stingGap.dur;
if (cues.some((cue) => cue.s + VOICE_AT < gapStart && cue.e + VOICE_AT > gapEnd)) throw new Error("caption cue straddles channel sting");
const ts = (time) => { const ms = Math.round(time * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
const captionTextFor = (cue, i) => {
  const text = fix(cue.t);
  return i === 0 || /[.?!]$/.test(cues[i - 1].t.trim()) ? text.replace(/^./, (char) => char.toUpperCase()) : text;
};
const srt = cues.map((cue, i) => `${i + 1}\n${ts(cue.s + VOICE_AT)} --> ${ts(Math.max(cue.e, cue.s + 0.8) + VOICE_AT)}\n${captionTextFor(cue, i)}\n`).join("\n");
const captionText = cues.map(captionTextFor).join("\n");
const WRONG = [/\bcomics catalog\b/i, /\bdiscogs\b/, /co -hidden/i, /called Hidden Cambria/i, /In my Coheed books for/i, /comics to tell you/i, /The collector is adding/i, /Everyone starting over/i, /new stand/i, /bagged and bordered/i, /next to image/, /and image runs/, /\bCory\b/, /Dave Sims/, /Cerebus the aardvark/, /aardvark Vanneheim/i, /starring in aardvark/i, /Rob Strad/, /\bShrab\b/, /slave labor graphics/, /smart ass/i, /R &B/, /This guy's nailed/, / -/];
const remaining = WRONG.filter((pattern) => pattern.test(captionText));
if (remaining.length) throw new Error(`caption fixes incomplete: ${remaining.join(", ")}`);
fs.writeFileSync(path.join(out, "captions.srt"), srt);

const utm = (pathname = "") => `https://www.comixcatalog.com${pathname}?utm_source=youtube&utm_medium=video&utm_campaign=${config.utmCampaign}`;
const description = `${config.descriptionIntro}

Books in this episode:
- Cerebus by Dave Sim, Aardvark-Vanaheim, 1977 to 2004
  ${utm("/series/12e7f062-06db-4731-928c-7b934d3cfcda")}
- Milk & Cheese by Evan Dorkin, Slave Labor Graphics, 1991
  ${utm("/series/256f81c4-6039-47b4-86bf-23354abe1d7d")}
- Scud the Disposable Assassin by Rob Schrab, Fireman Press 1994 and Image 2008 (the 2008 Image finale is on ComixCatalog so far)
  ${utm("/series/73ef87ef-3fbc-4afc-970f-df6c9df18b8f")}
- Malibu's Ultraverse, 1993. Start with Hardcase
  ${utm("/series/eb2cfc76-b82d-4911-8e36-cb6d5b16fbd0")}

Track your collection on ComixCatalog: ${utm()}

Chapters
${chapters.join("\n")}

Credits
Cover art is the property of Aardvark-Vanaheim, SLG Publishing, Fireman Press, Image Comics, Malibu Comics, Marvel, Evil Ink/Boom! Studios and the respective creators, shown for commentary and review.
Music: "Rollin at 5" and "Funkorama" by Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License. http://creativecommons.org/licenses/by/4.0/

#ComixCatalog #ComicCollecting #IndieComics #LongBox`;
if (description.includes("—")) throw new Error("description contains an em dash");
const shorts = config.shorts.map((short) => `### ${short.id}

File: \`shorts/${short.id}.mp4\`

Title: ${short.title}

Description:
\`\`\`
${short.description}
\`\`\`

Suggested time: ${short.schedule}`).join("\n\n");
const md = `# Episode 003 upload package

Video: \`episode-003.mp4\` (in this folder) · ${mmss(ep.duration)} · 1920x1080
Captions: \`captions.srt\` (upload as English captions)

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

The episode itself is suggested for Mon Oct 19. These times are suggestions. You schedule them in Studio.

${shorts}

## Upload checklist
- [ ] Upload as Unlisted first, watch it through once
- [ ] Title, description, tags pasted
- [ ] captions.srt uploaded (English)
- [ ] Thumbnail set
- [ ] End screen added
- [ ] Add to the channel's episode playlist
- [ ] Public, then pin the comment
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
