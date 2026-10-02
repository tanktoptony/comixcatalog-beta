import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { encodePhoto } from "./photoEncode.js";

// A phone-sized photo with real detail (noise, so it doesn't compress to
// nothing), GPS in its EXIF, and an orientation flag.
async function phonePhoto({ width = 4032, height = 3024, orientation = 1 } = {}) {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  let s = 12345;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (i % 3 === 0 ? (i / 3) % width : s) & 0xff;
  }
  const withGps = await sharp(raw, { raw: { width, height, channels } })
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone 15" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 52/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "87/1 37/1 0/1" },
    })
    .jpeg({ quality: 98 })
    .toBuffer();
  // withExif doesn't set the orientation tag; add it while keeping the GPS.
  return orientation === 1 ? withGps : sharp(withGps).keepExif().withMetadata({ orientation }).jpeg({ quality: 98 }).toBuffer();
}

test("a big phone photo comes out small, WebP, capped at 1600px, with no EXIF or GPS", async () => {
  const input = await phonePhoto();
  const inMeta = await sharp(input).metadata();
  assert.ok(inMeta.exif, "fixture really carries EXIF");
  assert.ok(input.length > 8 * 1024 * 1024, `fixture is a big photo (${(input.length / 1e6).toFixed(1)} MB)`);

  const { full, thumb } = await encodePhoto(input);
  const out = await sharp(full.data).metadata();
  assert.equal(out.format, "webp");
  assert.equal(Math.max(out.width, out.height), 1600);
  assert.equal(out.exif, undefined, "no EXIF block at all, so no GPS");
  assert.equal(out.icc, undefined);
  assert.equal(out.xmp, undefined);
  assert.ok(full.data.length < 1.5 * 1024 * 1024, `full image is ${(full.data.length / 1e6).toFixed(2)} MB`);

  const t = await sharp(thumb).metadata();
  assert.equal(t.width, 400);
  assert.equal(t.exif, undefined);
});

test("EXIF orientation is applied before it's stripped", async () => {
  // Orientation 6 = rotate 90° clockwise to display: landscape pixels, portrait photo.
  const input = await phonePhoto({ width: 2000, height: 1000, orientation: 6 });
  const m = await sharp(input).metadata();
  assert.equal(m.orientation, 6, "fixture really is flagged to rotate");
  const { full } = await encodePhoto(input);
  const out = await sharp(full.data).metadata();
  assert.ok(out.height > out.width, `came out ${out.width}x${out.height}, should be portrait`);
});

test("small photos aren't blown up; garbage is rejected", async () => {
  const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#c33" } }).jpeg().toBuffer();
  const { full } = await encodePhoto(small);
  assert.equal(full.info.width, 800);
  await assert.rejects(() => encodePhoto(Buffer.from("not an image at all")));
});
