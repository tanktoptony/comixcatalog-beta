// Covers for link-preview cards, as data URLs Satori can draw.
//
// Originals run up to 13 MB and the small copies are WebP, which Satori
// cannot decode. Supabase's image transform (already used for avatars and
// the Story card) hands back a ~600px JPEG or PNG instead. No sharp here:
// sharp next to next/og clashes with Next's bundled libvips and has broken
// the opengraph-image build before.
const OBJECT_MARKER = "/storage/v1/object/public/";
const RENDER_MARKER = "/storage/v1/render/image/public/";
const DRAWABLE = /^image\/(jpeg|png|gif)/;

export function ogCoverUrl(url) {
  if (typeof url !== "string" || !url.includes(OBJECT_MARKER)) return url;
  const base = url.split(/[?#]/)[0].replace(OBJECT_MARKER, RENDER_MARKER);
  return `${base}?width=600&quality=80`;
}

async function fetchDrawable(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !DRAWABLE.test(type)) return null;
  return `data:${type.split(";")[0]};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

export async function ogCover(url) {
  if (!url) return null;
  try {
    return (await fetchDrawable(ogCoverUrl(url))) ?? null;
  } catch (error) {
    console.warn("OG cover unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}
