import sharp from "sharp";
import { PHOTO_LIMITS } from "./listingPhotos.js";

// Server-only: turn an uploaded photo into what we store. Rotate per EXIF,
// then re-encode. sharp writes no metadata unless asked (no withMetadata /
// keepMetadata here), so EXIF and GPS never leave. Long edge capped at
// 1600px as WebP q80, plus a 400px-wide thumb. Throws on unreadable input.
export async function encodePhoto(input) {
  const base = sharp(input, { failOn: "error" }).rotate();
  const full = await base
    .clone()
    .resize({ width: PHOTO_LIMITS.longEdge, height: PHOTO_LIMITS.longEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: PHOTO_LIMITS.thumbWidth, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  return { full, thumb };
}
