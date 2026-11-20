#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { normalizeTimeline, segmentAssets, assetPath, formatTime } from "../shared/timeline.js";
import { TEXT_ONLY_TYPES, ANIMATED_CARD_TYPES, FLICKER_EDGE_DELTA, textOnlySegments, findRetakeSuspects, findZeroRuns, maximumFlashDelta, kenBurnsWindow, formatSuspect } from "../shared/qc.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help")) {
  console.log("Usage: npm run qc -- <episode-dir> [--render file.mp4] [--shorts] [--public dir] [--index file]");
  process.exit(argv.length ? 0 : 2);
}
const episodeArg = argv[0];
const option = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const withShorts = argv.includes("--shorts");
const render = option("--render");
const publicDir = path.resolve(option("--public", path.join(root, "public")));
const indexFile = path.resolve(option("--index", path.join(root, "shared", "generated", "assetIndex.json")));
const episodeDir = path.resolve(root, episodeArg);
const results = [];
const add = (status, check, detail) => results.push({ status, check, detail });
const run = (command, args, opts = {}) => {
  const r = spawnSync(command, args, { encoding: opts.binary ? null : "utf8", maxBuffer: 1024 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${command} failed: ${r.error?.message ?? String(r.stderr).slice(-1000)}`);
  return r;
};

if (render) {
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const probe = spawnSync(tool, ["-version"], { encoding: "utf8" });
    if (probe.error || probe.status !== 0) {
      console.error(`${tool} is required for --render checks and was not found on PATH`);
      process.exit(2);
    }
  }
}

if (!fs.existsSync(episodeDir)) throw new Error(`Episode directory not found: ${episodeDir}`);
const timelines = [{ name: "episode", module: await import(pathToFileURL(path.join(episodeDir, "timeline.js"))) }];
if (withShorts) timelines.push({ name: "shorts", module: await import(pathToFileURL(path.join(episodeDir, "shorts-timeline.js"))) });
const normalized = timelines.map((x) => ({ ...x, timeline: x.module.default, normalized: normalizeTimeline(x.module.default, 30) }));

let index = { files: [] };
try { index = JSON.parse(fs.readFileSync(indexFile, "utf8")); }
catch { add("FAIL", "Assets", `asset index missing or unreadable: ${indexFile}`); }
const indexed = new Set(index.files ?? []);
const missing = [];
for (const { timeline } of normalized) {
  const assets = new Set(timeline.segments.flatMap(segmentAssets));
  for (const lane of [timeline.audio?.narration, timeline.audio?.music, timeline.audio?.sting]) if (lane?.asset) assets.add(lane.asset);
  for (const asset of assets) {
    const rel = assetPath(timeline.assetEpisodeId ?? timeline.id, asset).replaceAll("/", path.sep);
    const indexRel = rel.replaceAll(path.sep, "/");
    const extensions = path.extname(rel) ? [""] : [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".webm", ".wav", ".m4a", ".mp3", ".aac", ".ogg"];
    if (!extensions.some((ext) => fs.existsSync(path.join(publicDir, rel + ext)))) missing.push(`${indexRel} (not in public)`);
    if (!extensions.some((ext) => indexed.has(indexRel + ext))) missing.push(`${indexRel} (not in index)`);
  }
}
if (fs.existsSync(indexFile)) {
  const indexTime = fs.statSync(indexFile).mtimeMs;
  const epPublic = path.join(publicDir, normalized[0].timeline.assetEpisodeId ?? normalized[0].timeline.id);
  const newest = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).reduce((m, e) => e.isDirectory() ? Math.max(m, newest(path.join(dir, e.name))) : Math.max(m, fs.statSync(path.join(dir, e.name)).mtimeMs), 0) : 0;
  if (newest(epPublic) > indexTime) missing.push("index is stale: run npm run index");
}
add(missing.length ? "FAIL" : "PASS", "Assets", missing.length ? [...new Set(missing)].join("; ") : "all referenced files exist and are indexed");

for (const { name, normalized: tl } of normalized) {
  const cards = textOnlySegments(tl.segments);
  const status = cards.length > 8 ? "FAIL" : cards.length >= 7 ? "WARN" : "PASS";
  add(status, `Text-only cards (${name})`, `${cards.length}${cards.length ? `: ${cards.map((s) => `${formatTime(s.start)} ${s.type}`).join(", ")}` : ""}`);
}

const wordSets = [{ name: "episode", words: timelines[0].module.narrationWords ?? [] }];
if (withShorts) wordSets.push({ name: "shorts", words: timelines[1].module.shortsWords ?? [] });
for (const set of wordSets) {
  const suspects = findRetakeSuspects(set.words);
  add(suspects.length ? "WARN" : "PASS", `Retakes (${set.name})`, suspects.length ? suspects.map(formatSuspect).join("; ") : "none");
}

async function makeZoomSheet() {
  const tiles = [];
  for (const { timeline, normalized: tl } of normalized) {
    for (const seg of tl.segments) {
      const asset = segmentAssets(seg)[0];
      const moving = asset && ((["cover", "kenBurns", "panel", "screen", "media"].includes(seg.type) && seg.treatment !== "still") || seg.focus || (seg.zoom && seg.zoom !== 1));
      if (!moving || /\.(mp4|mov|webm|gif)$/i.test(asset)) continue;
      const source = path.join(publicDir, assetPath(timeline.assetEpisodeId ?? timeline.id, asset));
      if (!fs.existsSync(source)) continue;
      const meta = await sharp(source).metadata();
      for (const p of [0, 1]) {
        let win = { left: 0, top: 0, width: 1, height: 1 };
        if (["panDown", "panUp", "focus", "focusOut", "panAcross", "zoomTo"].includes(seg.treatment)) win = kenBurnsWindow(seg.treatment, seg.focus, p);
        else {
          const z = seg.type === "screen" ? 1 + ((seg.zoom ?? 1.12) - 1) * p : seg.treatment === "slowPull" ? 1.07 - .07 * p : 1 + (seg.type === "panel" ? .05 : .07) * p;
          win = { left: (1 - 1 / z) / 2, top: (1 - 1 / z) / 2, width: 1 / z, height: 1 / z };
        }
        const left = Math.max(0, Math.min(meta.width - 1, Math.round(win.left * meta.width)));
        const top = Math.max(0, Math.min(meta.height - 1, Math.round(win.top * meta.height)));
        const width = Math.max(1, Math.min(meta.width - left, Math.round(win.width * meta.width)));
        const height = Math.max(1, Math.min(meta.height - top, Math.round(win.height * meta.height)));
        const image = await sharp(source).extract({ left, top, width, height }).resize(320, 180, { fit: "cover" }).toBuffer();
        const label = `${formatTime(seg.start)} ${p ? "last" : "first"} ${asset}`.replace(/[&<>]/g, "");
        const svg = Buffer.from(`<svg width="320" height="28"><rect width="320" height="28" fill="#090c11"/><text x="6" y="19" fill="white" font-family="Arial" font-size="12">${label.slice(0, 47)}</text></svg>`);
        tiles.push(await sharp({ create: { width: 320, height: 208, channels: 3, background: "#090c11" } }).composite([{ input: image, top: 0, left: 0 }, { input: svg, top: 180, left: 0 }]).png().toBuffer());
      }
    }
  }
  const cols = 5, rows = Math.max(1, Math.ceil(tiles.length / cols));
  const out = path.join(episodeDir, "output", "qc-zoom-sheet.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp({ create: { width: cols * 320, height: rows * 208, channels: 3, background: "#090c11" } }).composite(tiles.map((input, i) => ({ input, left: (i % cols) * 320, top: Math.floor(i / cols) * 208 }))).png().toFile(out);
  add("WARN", "Zoom crop sheet", `${tiles.length / 2} moving image segments, review ${out}`);
}
await makeZoomSheet();

if (render) {
  const renderPath = path.resolve(render);
  const pcm = run("ffmpeg", ["-v", "error", "-i", renderPath, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1"], { binary: true }).stdout;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const zeros = findZeroRuns(samples, 48000);
  add(zeros.length ? "FAIL" : "PASS", "Digital silence", zeros.length ? zeros.map((z) => `${formatTime(z.start)} to ${formatTime(z.end)} (${Math.round(z.duration * 1000)} ms)`).join("; ") : "no exact-zero runs of 30 ms or longer");

  const loud = run("ffmpeg", ["-nostats", "-i", renderPath, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]).stderr;
  const summary = loud.slice(loud.lastIndexOf("Summary:"));
  const lufs = Number(summary.match(/I:\s*(-?[\d.]+) LUFS/)?.[1]);
  const peak = Number(summary.match(/Peak:\s*(-?[\d.]+) dBFS/)?.[1]);
  const loudWarn = !Number.isFinite(lufs) || lufs < -16 || lufs > -12 || peak > -1;
  add(loudWarn ? "WARN" : "PASS", "Loudness", `integrated ${lufs} LUFS, true peak ${peak} dBTP`);

  const flickers = [];
  for (const seg of normalized[0].normalized.segments.filter((s) => ANIMATED_CARD_TYPES.has(s.type))) {
    const middle = Math.max(seg.start, (seg.start + seg.end) / 2 - 0.2);
    const raw = run("ffmpeg", ["-v", "error", "-ss", String(middle), "-i", renderPath, "-frames:v", "12", "-vf", "scale=1920:1080,crop=1152:648:384:216,format=gray", "-f", "rawvideo", "pipe:1"], { binary: true }).stdout;
    const w = 1152, h = 648, frameSize = w * h, means = [];
    for (let f = 0; f < Math.floor(raw.length / frameSize); f++) {
      const o = f * frameSize; let top = 0, bottom = 0, left = 0, right = 0;
      for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) { top += raw[o + y * w + x]; bottom += raw[o + (h - 1 - y) * w + x]; }
      for (let x = 0; x < 3; x++) for (let y = 0; y < h; y++) { left += raw[o + y * w + x]; right += raw[o + y * w + w - 1 - x]; }
      means.push([top / (w * 3), bottom / (w * 3), left / (h * 3), right / (h * 3)]);
    }
    const delta = maximumFlashDelta(means);
    if (delta > FLICKER_EDGE_DELTA) flickers.push(`${formatTime(seg.start)} ${seg.type} (${delta.toFixed(1)})`);
  }
  add(flickers.length ? "FAIL" : "PASS", "Edge flicker", flickers.length ? flickers.join("; ") : `no edge flashes over ${FLICKER_EDGE_DELTA}`);
} else {
  add("PASS", "Media checks", "skipped, no --render supplied");
}

const widths = { status: 6, check: Math.max(5, ...results.map((r) => r.check.length)) };
console.log(`\n${"STATUS".padEnd(widths.status)}  ${"CHECK".padEnd(widths.check)}  DETAIL`);
console.log(`${"-".repeat(widths.status)}  ${"-".repeat(widths.check)}  ${"-".repeat(50)}`);
for (const r of results) console.log(`${r.status.padEnd(widths.status)}  ${r.check.padEnd(widths.check)}  ${r.detail}`);
const counts = Object.fromEntries(["PASS", "WARN", "FAIL"].map((s) => [s, results.filter((r) => r.status === s).length]));
console.log(`\n${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL`);
process.exitCode = counts.FAIL ? 1 : 0;
