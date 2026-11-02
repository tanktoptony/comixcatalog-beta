// Render single frames of an episode at chosen beats (one bundle), for a quick
// layout check before a preview or full render.
//
//   node scripts/spot-frames.mjs <CompositionId> <out-dir> <seconds|"beat text">[@offset]...
//
// A number is seconds on the program clock. Anything else is matched against
// segment beats (case-insensitive substring) and renders that segment's start
// plus @offset seconds (default 1.2).

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [id, outDir, ...spots] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browserCandidates = process.platform === "win32" ? [
  path.join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
] : [];
const browserExecutable = browserCandidates.find((candidate) => fs.existsSync(candidate));
const opts = browserExecutable ? { browserExecutable } : {};

const serveUrl = await bundle({ entryPoint: path.join(root, "src", "index.jsx"), publicDir: path.join(root, "public") });
const composition = await selectComposition({ serveUrl, id, ...opts });
const segments = composition.props.timeline.segments;
for (const [i, spot] of spots.entries()) {
  const [what, off] = spot.split("@");
  let t = Number(what);
  if (!Number.isFinite(t)) {
    const seg = segments.find((s) => (s.beat ?? "").toLowerCase().includes(what.toLowerCase()));
    if (!seg) { console.log(`no beat matches "${what}"`); continue; }
    t = seg.start + (off ? Number(off) : 1.2);
  }
  const frame = Math.min(composition.durationInFrames - 1, Math.round(t * composition.fps));
  const out = path.join(outDir, `${String(i).padStart(2, "0")}-${frame}.png`);
  await renderStill({ serveUrl, composition, frame, output: out, imageFormat: "png", scale: 0.5, ...opts });
  console.log(`${out}  ${spot}`);
}
