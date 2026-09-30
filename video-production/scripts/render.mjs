// Render an episode's visual track.
//
//   node scripts/render.mjs episode-001            full 1920x1080, H.264 CRF 18
//   node scripts/render.mjs episode-001 --preview  960x540, faster, CRF 28

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { EPISODES, assetFolder } from "../episodes.js";
import { normalizeTimeline } from "../shared/timeline.js";
import { VIDEO } from "../shared/brand.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
const preview = process.argv.includes("--preview");
const ep = EPISODES.find((e) => e.id === id);
if (!ep) throw new Error(`Unknown episode "${id}". Known: ${EPISODES.map((e) => e.id).join(", ")}`);
if (!ep.segments.length) {
  console.error(`${id} has no segments. Its shot list comes from ${ep.blueprint ?? "its blueprint"}, which has not been transcribed into ${id}/timeline.js yet. Refusing to render an empty or invented track.`);
  process.exit(1);
}

const timeline = normalizeTimeline(ep, VIDEO.fps);
const outDir = path.join(root, ep.id, "output");
fs.mkdirSync(outDir, { recursive: true });
const outputLocation = path.join(outDir, `${ep.id}-visual-track${preview ? "-preview" : ""}.mp4`);

console.log(`Bundling...`);
const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.jsx"), publicDir: path.join(root, "public") });
const inputProps = { episodeId: assetFolder(ep), timeline };
const composition = await selectComposition({ serveUrl, id: ep.compositionId, inputProps });

const started = Date.now();
let lastPct = -1;
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  codec: "h264",
  crf: preview ? 28 : 18,
  pixelFormat: "yuv420p",
  colorSpace: "bt709",
  scale: preview ? 0.5 : 1,
  x264Preset: preview ? "veryfast" : "medium",
  outputLocation,
  onProgress: ({ progress }) => {
    const pct = Math.floor(progress * 100);
    if (pct % 5 === 0 && pct !== lastPct) {
      lastPct = pct;
      console.log(`${pct}% (${Math.round((Date.now() - started) / 1000)}s)`);
    }
  },
});
console.log(`Wrote ${outputLocation} (${(fs.statSync(outputLocation).size / 1e6).toFixed(1)} MB, ${Math.round((Date.now() - started) / 1000)}s)`);
