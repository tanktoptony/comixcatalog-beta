// Render vertical Shorts to each episode's output/shorts folder at 1080x1920.
//
//   node scripts/render-shorts.mjs            all
//   node scripts/render-shorts.mjs <id> ...   some

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { SHORTS } from "../shorts.js";
import { EPISODES } from "../episodes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wanted = process.argv.slice(2);
const shorts = SHORTS.filter((s) => !wanted.length || wanted.includes(s.id));

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.jsx"), publicDir: path.join(root, "public") });
for (const short of shorts) {
  const ep = EPISODES.find((candidate) => candidate.id === short.episode);
  if (!ep) throw new Error(`${short.id}: episode not found: ${short.episode}`);
  const outDir = path.join(root, ep.outputDir ?? ep.id, "output", "shorts");
  fs.mkdirSync(outDir, { recursive: true });
  const composition = await selectComposition({ serveUrl, id: short.id });
  const outputLocation = path.join(outDir, `${short.id}.mp4`);
  const started = Date.now();
  await renderMedia({ serveUrl, composition, codec: "h264", crf: 20, pixelFormat: "yuv420p", colorSpace: "bt709", outputLocation });
  console.log(`wrote ${outputLocation} (${Math.round((Date.now() - started) / 1000)}s)`);
}
