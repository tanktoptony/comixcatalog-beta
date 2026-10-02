// Everything YouTube needs besides the video file, generated from the V3
// timeline and the narration transcript so timestamps are always right:
//
//   node scripts/youtube-package.mjs
//
// Writes ~/Desktop/episode-001-youtube/:
//   PACKAGE.md    title options, description (with chapters and links),
//                 tags, pinned comment, end-screen plan, upload checklist
//   captions.srt  captions from Tony's recording, timed to the voice
//   thumbnail-*.jpg copies of the rendered thumbnails
//
// Re-run after Tony's recording is transcribed; nothing here is hand-timed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ep from "../episode-001/timeline.v3.js";
import words from "../episode-001/narration.words.js";
import { narrationWords } from "../episode-001/timeline.v3.js";
import { fixCaption } from "../episode-001/captionFixes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(os.homedir(), "Desktop", "episode-001-youtube");
fs.mkdirSync(out, { recursive: true });
const scratch = String(words.source ?? "").startsWith("NARRATION_SCRATCH");
const VOICE_AT = ep.audio?.narration?.at ?? 0;

const mmss = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};

// ── Chapters (YouTube: first at 0:00, at least 3, each >= 10 s) ──────────
const CHAPTERS = [
  [null, "Where do I get back into X-Men?"],
  ["Quick background", "How I got into X-Men"],
  ["The obvious move is to start at the beginning", "Why not start at X-Men #1"],
  ["Number one The Dark Phoenix Saga", "1. The Dark Phoenix Saga"],
  ["Number two Days of Future Past", "2. Days of Future Past"],
  ["Number three", "3. X-Cutioner's Song"],
  ["Number four God Loves Man Kills", "4. God Loves, Man Kills"],
  ["Number five House of M", "5. House of M"],
  ["then read House of X and Powers of X", "Later: House of X / Powers of X"],
  ["Here's my actual advice", "Shop like a kid"],
  ["Quick one I built ComixCatalog", "Tracking what you read (ComixCatalog)"],
  ["So the shelf", "The five-book starter shelf"],
];
const segAt = (beat) => ep.segments.find((s) => s.beat === beat)?.at;
const chapters = CHAPTERS.map(([beat, label]) => ({ label, at: beat ? segAt(beat) : 0 }));
for (const c of chapters) if (c.at == null) throw new Error(`chapter anchor not in timeline: ${c.label}`);
for (let i = 1; i < chapters.length; i += 1) {
  if (chapters[i].at - chapters[i - 1].at < 10) console.warn(`chapter "${chapters[i - 1].label}" is under 10 s; YouTube may drop chapters`);
}
const chapterText = chapters.map((c) => `${mmss(c.at)} ${c.label}`).join("\n");

// ── Captions: Tony's actual words (he ad-libs), timed word by word ───────
const fix = fixCaption;
// Group words into caption lines: break after sentence punctuation, on a
// pause over 0.6 s, or before a line would pass 84 characters.
const glue = (prev, w) => (prev && !/^[-,.!?;:']/.test(w) ? prev + " " + w : prev + w);
const lines = [];
let cur = null;
for (let i = 0; i < narrationWords.length; i += 1) {
  const w = narrationWords[i];
  const next = narrationWords[i + 1];
  if (cur && glue(cur.t, w.w).length > 84) {
    lines.push(cur);
    cur = null;
  }
  cur = cur ? { ...cur, t: glue(cur.t, w.w), e: w.e } : { t: w.w, s: w.s, e: w.e };
  const sentenceEnd = /[.!?]["”]?$/.test(w.w) && cur.t.length > 12;
  if (!next || sentenceEnd || next.s - w.e > 0.6) {
    lines.push(cur);
    cur = null;
  }
}
const cues = lines.map((l, i) => {
  const start = VOICE_AT + l.s;
  const nextStart = i + 1 < lines.length ? VOICE_AT + lines[i + 1].s : Infinity;
  const end = Math.min(nextStart - 0.05, VOICE_AT + l.e + 0.6);
  return { s: +start.toFixed(3), e: +Math.max(end, start + 0.8).toFixed(3), t: fix(l.t) };
});
const srt = cues
  .map((c, i) => {
    // Two balanced lines: split at the space nearest the middle.
    let wrapped = c.t;
    if (c.t.length > 42) {
      const mid = c.t.length / 2;
      let cut = -1;
      for (let j = c.t.indexOf(" "); j >= 0; j = c.t.indexOf(" ", j + 1)) if (cut < 0 || Math.abs(j - mid) < Math.abs(cut - mid)) cut = j;
      if (cut > 0) wrapped = c.t.slice(0, cut) + "\n" + c.t.slice(cut + 1);
    }
    return i + 1 + "\n" + srtTime(c.s) + " --> " + srtTime(c.e) + "\n" + wrapped + "\n";
  })
  .join("\n");
fs.writeFileSync(path.join(out, "captions.srt"), srt);
// Same lines for burned-in captions in the Shorts (src/Shorts.jsx).
const captionCues = cues;
fs.writeFileSync(
  path.join(root, "episode-001", "captions.generated.js"),
  "// Generated by scripts/youtube-package.mjs. Do not edit by hand.\nexport default " + JSON.stringify(captionCues) + ";\n"
);

// ── Links (utm-tagged so signups from YouTube are attributed) ────────────
const utm = "utm_source=youtube&utm_medium=video&utm_campaign=ep001";
const site = (p) => `https://www.comixcatalog.com${p}${p.includes("?") ? "&" : "?"}${utm}`;
const search = (q) => site(`/search?q=${encodeURIComponent(q)}`);
const BOOKS = [
  ["The Dark Phoenix Saga: Uncanny X-Men #129-137 (1980)", "x-men 129"],
  ["Days of Future Past: Uncanny X-Men #141-142 (1981)", "x-men 141"],
  ["X-Cutioner's Song: X-Men #14-16 and crossovers (1992-93)", "x-men 14"],
  ["God Loves, Man Kills: Marvel Graphic Novel #5 (1982)", "god loves man kills"],
  ["House of M #1-8 (2005)", "house of m"],
  ["Later: House of X / Powers of X (2019)", "house of x"],
];

const description = `Sixty years of X-Men, a dozen books with "X-Men" in the title, and reading orders that look like tax forms. Here's the shortcut: five books, one shelf, no homework.

${chapterText}

📚 The starter shelf (look them up, see every cover, add them to your wantlist):
${BOOKS.map(([label, q]) => `• ${label}: ${search(q)}`).join("\n")}

Track what you own and what you're hunting, free: ${site("/start")}

Follow along:
Instagram: https://www.instagram.com/comixcatalog
Discord: https://discord.gg/aQruGVnD3y
Reddit: https://www.reddit.com/r/comixcatalog

Which one did you start with? Tell me in the comments.

Music:
"Rollin at 5" and "Funkorama" by Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/

Comic covers and artwork are the property of Marvel Entertainment and their creators, shown here for commentary and review.

#XMen #Comics #MarvelComics`;

const md = `# Episode 001 YouTube package
${scratch ? "\n> **Timings below come from the scratch (robot) voice.** Re-run `node scripts/youtube-package.mjs` after Tony's recording is transcribed and everything re-times itself.\n" : ""}
## Title (pick one; under 60 characters reads in full on phones)
1. Where to Start Reading X-Men (Without Losing Your Mind)
2. Don't Start X-Men at #1. Start Here Instead.
3. The Only 5 X-Men Books You Need to Start

## Thumbnail
- A "The shelf": \`thumbnail-A-shelf.jpg\` (pairs with title 1 or 3)
- B "Not here / Start here": \`thumbnail-B-not-here.jpg\` (pairs with title 2; the strongest curiosity hook)
- C "Face": needs a photo of Tony (\`extras/TONY_FACE\`); thumbnails with a face usually win once you have one.
YouTube lets you A/B test up to 3 thumbnails (Test & Compare) after upload.

## Description (paste as-is)
\`\`\`
${description}
\`\`\`

## Tags
x-men, xmen, where to start reading x-men, x-men reading order, how to read x-men, x-men comics for beginners, dark phoenix saga, days of future past, x-cutioners song, god loves man kills, house of m, house of x, powers of x, x-men 97, x-men the animated series, marvel comics, comic books, comics for beginners, gambit, colossus, chris claremont

## Captions
Upload \`captions.srt\` (English) under Subtitles. It's Tony's actual words, timed word by word, with names spelled right.

## Pinned comment
Which one did you start with? Mine was House of M, handed to me at Graham Crackers. If you want the whole shelf in one place, it's on ComixCatalog: ${site("/start")}

## End screen (last 20 s)
- Subscribe button, left.
- "Best for viewer" video, right (until there's a second episode, use a Short from this video).
- Link card to comixcatalog.com once the channel is eligible for external links.

## Cards (top-right "i" popups)
- At "${mmss(segAt("Quick one I built ComixCatalog") ?? 0)}": link to ComixCatalog (needs channel eligibility for external links; otherwise mention it verbally, as the script does).

## Upload settings
- Visibility: **Unlisted** first. Wait for Checks (copyright) to finish, then Public.
- Audience: Not made for kids.
- Category: Entertainment (or Education).
- Language: English; captions: English (upload captions.srt).
${String(words.source).includes("HEYGEN") ? "- Altered or synthetic content: **Yes**. The narration is an AI clone of Tony's voice (HeyGen), which YouTube counts as realistic synthetic content." : "- Altered or synthetic content: **No** (Tony's real voice). If you ever publish with an AI or text-to-speech voice, answer Yes."}
- License: Standard YouTube.
- Comments: on; hold potentially inappropriate for review.
- Playlist: create "Where to Start" for future episodes.

## Shorts (in ./shorts; post 1 to 2 days apart, after the main video is public)
Each Short: set **Related video** to the main episode (Shorts editor > Related video), so viewers get a one-tap link to it.
- \`Short001NotNumberOne.mp4\`: "Don't start X-Men at #1 #xmen #comics #marvel". Post first; strongest hook.
- \`Short001Colossus.mp4\`: "I didn't pick my favorite X-Man. He picked me. #xmen #colossus #xmen97"
- \`Short001ShopLikeAKid.mp4\`: "How to actually get into comics #comics #comicbooks #xmen"
Same files work as Instagram Reels (post with the ComixCatalog /start link in bio).

## Chapters (already in the description)
\`\`\`
${chapterText}
\`\`\`
`;
fs.writeFileSync(path.join(out, "PACKAGE.md"), md);

for (const [from, to] of [["Thumb001Shelf.jpg", "thumbnail-A-shelf.jpg"], ["Thumb001NotHere.jpg", "thumbnail-B-not-here.jpg"], ["Thumb001Face.jpg", "thumbnail-C-face-PLACEHOLDER.jpg"]]) {
  const src = path.join(root, "episode-001", "output", "thumbnails", from);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, to));
}
console.log(`wrote ${out}${scratch ? " (scratch-voice timings)" : ""}; ${cues.length} caption lines; ${chapters.length} chapters`);
