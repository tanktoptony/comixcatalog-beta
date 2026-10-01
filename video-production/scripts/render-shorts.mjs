// Render the vertical Shorts (shorts.js, src/Shorts.jsx) to
// episode-001/output/shorts/<id>.mp4 at 1080x1920.
//
//   node scripts/render-shorts.mjs            all
//   node scripts/render-shorts.mjs <id> ...   some

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { SHORTS } from "../shorts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wanted = process.argv.slice(2);
const ids = SHORTS.map((s) => s.id).filter((id) => !wanted.length || wanted.includes(id));
const outDir = path.join(root, "episode-001", "output", "shorts");
fs.mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.jsx"), publicDir: path.join(root, "public") });
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id });
  const outputLocation = path.join(outDir, `${id}.mp4`);
  const started = Date.now();
  await renderMedia({ serveUrl, composition, codec: "h264", crf: 20, pixelFormat: "yuv420p", colorSpace: "bt709", outputLocation });
  console.log(`wrote ${outputLocation} (${Math.round((Date.now() - started) / 1000)}s)`);
}
