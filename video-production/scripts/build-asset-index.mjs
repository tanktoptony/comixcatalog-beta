// Index what is actually in public/ (the render cannot touch the filesystem,
// so components look assets up here) and write each episode's
// missing-assets report.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EPISODES } from "../episodes.js";
import { missingAssets } from "../shared/timeline.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");

function walk(dir, base = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    const rel = base ? `${base}/${name}` : name;
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? walk(full, rel) : [rel];
  });
}

const files = walk(pub).sort();
fs.mkdirSync(path.join(root, "shared", "generated"), { recursive: true });
fs.writeFileSync(path.join(root, "shared", "generated", "assetIndex.json"), JSON.stringify({ files }, null, 1));

for (const ep of EPISODES) {
  const missing = missingAssets(ep, files);
  const outDir = path.join(root, ep.id, "output");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${ep.id}-missing-assets.json`),
    JSON.stringify({ episode: ep.id, title: ep.title, generatedAt: new Date().toISOString(), segments: ep.segments.length, missingCount: missing.length, missing }, null, 2)
  );
  console.log(`${ep.id}: ${ep.segments.length} segments, ${missing.length} missing asset(s)${missing.length ? ": " + missing.map((m) => m.asset).join(", ") : ""}`);
}
console.log(`indexed ${files.length} files`);
