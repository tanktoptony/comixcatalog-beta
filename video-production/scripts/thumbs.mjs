// Render the YouTube thumbnails (src/Thumbnails.jsx) to PNG and a <2 MB JPEG
// (YouTube's upload limit) in <episode>/output/thumbnails.
//
//   node scripts/thumbs.mjs

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ids = ["Thumb001Shelf", "Thumb001NotHere", "Thumb001Face"];
const outDir = path.join(root, "episode-001", "output", "thumbnails");
fs.mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.jsx"), publicDir: path.join(root, "public") });
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id });
  const png = path.join(outDir, `${id}.png`);
  await renderStill({ serveUrl, composition, output: png, imageFormat: "png" });
  await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(png.replace(/\.png$/, ".jpg"));
  console.log(`wrote ${png}`);
}
