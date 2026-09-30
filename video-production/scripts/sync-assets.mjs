// Copy an episode's source assets into the workspace so renders never read
// from Desktop paths. Also copies the ComixCatalog logos from the site repo.
//
//   node scripts/sync-assets.mjs episode-001 [--from <dir with covers/>]

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const episodeId = process.argv[2];
if (!episodeId) throw new Error("usage: sync-assets.mjs <episode-id> [--from dir]");
const fromIdx = process.argv.indexOf("--from");
const from = fromIdx > 0 ? process.argv[fromIdx + 1] : path.join(os.homedir(), "Desktop", `${episodeId}-assets`);

function copyDir(src, dest, filter = () => true) {
  if (!fs.existsSync(src)) {
    console.warn(`skip: ${src} does not exist`);
    return 0;
  }
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    if (fs.statSync(s).isDirectory()) n += copyDir(s, path.join(dest, name), filter);
    else if (filter(name)) {
      fs.copyFileSync(s, path.join(dest, name));
      n += 1;
    }
  }
  return n;
}

const media = (name) => /\.(jpe?g|png|webp|gif|mp4|mov)$/i.test(name);
const covers = copyDir(path.join(from, "covers"), path.join(root, "public", episodeId, "covers"), media);
if (fs.existsSync(path.join(from, "manifest.json"))) {
  fs.copyFileSync(path.join(from, "manifest.json"), path.join(root, "public", episodeId, "covers-manifest.json"));
}
// Any other folders beside covers/ (tas/, screenshots/, ...) come along too.
let other = 0;
if (fs.existsSync(from)) {
  for (const name of fs.readdirSync(from)) {
    const s = path.join(from, name);
    if (name !== "covers" && fs.statSync(s).isDirectory()) other += copyDir(s, path.join(root, "public", episodeId, name), media);
  }
}
const logos = copyDir(path.join(root, "..", "public", "img", "logos"), path.join(root, "public", "brand"), media);
console.log(`${episodeId}: ${covers} covers, ${other} other assets from ${from}; ${logos} brand files`);

// The site's logo PNGs are 1024x1024 on an opaque off-white field. Derive
// transparent versions for dark frames: knock out the near-white background,
// and crop the wordmark to its lettering (its tagline, "The marketplace for
// comic collectors", is left out while the marketplace is not live).
const { default: sharp } = await import("sharp");
async function knockout(src, dest, crop) {
  let img = sharp(src);
  if (crop) img = img.extract(crop);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    // Fade from opaque at 225 to clear at 245 so edges stay smooth.
    if (min > 225) data[i + 3] = Math.max(0, Math.round(255 * (245 - min) / 20));
  }
  await sharp(data, { raw: info }).trim().png().toFile(dest);
}
const brandDir = path.join(root, "public", "brand");
await knockout(path.join(brandDir, "cc_badge.png"), path.join(brandDir, "badge-transparent.png"));
await knockout(path.join(brandDir, "wordmark.png"), path.join(brandDir, "wordmark-transparent.png"), { left: 40, top: 260, width: 944, height: 440 });
console.log("brand: wrote badge-transparent.png, wordmark-transparent.png");
