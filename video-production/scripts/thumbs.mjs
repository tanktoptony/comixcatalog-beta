// Render the YouTube thumbnails (src/Thumbnails.jsx) to PNG and a <2 MB JPEG
// (YouTube's upload limit) in <episode>/output/thumbnails.
//
//   node scripts/thumbs.mjs [episode-dir] [CompositionId...]

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [episodeDir = "episode-001", ...requestedIds] = process.argv.slice(2);
const ids = requestedIds.length ? requestedIds : ["Thumb001Shelf", "Thumb001NotHere", "Thumb001Face"];
const outDir = path.join(root, episodeDir, "output", "thumbnails");
fs.mkdirSync(outDir, { recursive: true });
const browserCandidates = process.platform === "win32" ? [
  path.join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
] : [];
const browserExecutable = browserCandidates.find((candidate) => fs.existsSync(candidate));

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.jsx"), publicDir: path.join(root, "public") });
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id, ...(browserExecutable ? { browserExecutable } : {}) });
  const png = path.join(outDir, `${id}.png`);
  await renderStill({ serveUrl, composition, output: png, imageFormat: "png", ...(browserExecutable ? { browserExecutable } : {}) });
  await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(png.replace(/\.png$/, ".jpg"));
  console.log(`wrote ${png}`);
}
