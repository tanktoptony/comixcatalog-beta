import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "public", "avatars", "cc_badge.png");
const OUTPUT = path.join(ROOT, "public", "avatars", "default");
const REPORT = path.join(ROOT, "reports", "default-avatars-sheet.png");

const palettes = [
  ["Crimson / gold", "#9E1834", "#F5B82E"],
  ["Emerald / gold", "#08745B", "#E9B949"],
  ["Violet / silver", "#62449A", "#D9DEE7"],
  ["Black / gold", "#17191D", "#E4B544"],
  ["Teal / cream", "#087B82", "#F1E6C9"],
  ["Orange / navy", "#E56528", "#162A50"],
  ["Hulk green / purple", "#4F9B45", "#663A82"],
  ["Spidey red / blue", "#B52232", "#1855A1"],
  ["Batman gray / yellow", "#50545A", "#F0C735"],
  ["Cosmic magenta / cyan", "#A72C86", "#27BFC3"],
  ["Silver-age cream / red", "#EFE0B8", "#B42A32"],
  ["Venom black / white", "#15171B", "#ECEFF1"],
];

const hexToRgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, amount) => a.map((value, i) => Math.round(value + (b[i] - value) * amount));
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function recolor(source, primaryHex, secondaryHex) {
  const primary = hexToRgb(primaryHex);
  const secondary = hexToRgb(secondaryHex);
  const pixels = Buffer.from(source.data);

  for (let i = 0; i < pixels.length; i += 4) {
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const light = luminance(rgb);

    // Leave the warm-white canvas and neutral drop shadow intact. The source
    // art has two strongly separated colour families, so this preserves its
    // antialiasing and engraved highlights without muddy cross-channel hues.
    if (saturation < 0.16) continue;

    const isGold = r > b * 1.35 && g > b * 1.15;
    const target = isGold ? secondary : primary;
    // Keep each palette colour recognisable even when a dark colour replaces
    // the source's bright gold. Variation around the family midpoint retains
    // bevels and highlights without washing navy/purple/black into gray.
    const midpoint = isGold ? 0.66 : 0.31;
    const delta = Math.max(-0.55, Math.min(0.3, (light - midpoint) * 0.85));
    const mapped = delta < 0
      ? mix(target, [0, 0, 0], -delta)
      : mix(target, [255, 255, 255], delta);
    [pixels[i], pixels[i + 1], pixels[i + 2]] = mapped;
  }
  return pixels;
}

await mkdir(OUTPUT, { recursive: true });
await mkdir(path.dirname(REPORT), { recursive: true });

const source = await sharp(SOURCE).ensureAlpha().resize(256, 256).raw().toBuffer({ resolveWithObject: true });
const cards = [];
for (const [index, [name, primary, secondary]] of palettes.entries()) {
  const number = String(index + 1).padStart(2, "0");
  const pixels = recolor(source, primary, secondary);
  const image = sharp(pixels, { raw: source.info });
  await image.clone().webp({ quality: 92 }).toFile(path.join(OUTPUT, `cc_${number}.webp`));
  await image.clone().resize(64, 64).webp({ quality: 90 }).toFile(path.join(OUTPUT, `cc_${number}_64.webp`));

  const label = Buffer.from(`<svg width="320" height="42"><rect width="320" height="42" fill="#111827"/><text x="160" y="17" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="13" font-weight="700">CC ${number}</text><text x="160" y="34" text-anchor="middle" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="11">${name}</text></svg>`);
  cards.push(await sharp({ create: { width: 320, height: 320, channels: 4, background: "#f5f2eb" } })
    .composite([
      { input: await image.clone().resize(256, 256).png().toBuffer(), left: 32, top: 10 },
      { input: label, left: 0, top: 278 },
    ]).png().toBuffer());
}

await sharp({ create: { width: 1280, height: 960, channels: 4, background: "#111827" } })
  .composite(cards.map((input, index) => ({ input, left: (index % 4) * 320, top: Math.floor(index / 4) * 320 })))
  .png()
  .toFile(REPORT);

console.log(`Generated ${palettes.length} default avatars in ${OUTPUT}`);
console.log(`Contact sheet: ${REPORT}`);
