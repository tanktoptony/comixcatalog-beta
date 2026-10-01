// Small WebP copies of catalog covers for grids, search results and shelves.
//
// Originals in the canonical-covers bucket are whatever ComicVine served,
// often 3-13 MB each, and a search page drew 35 of them into 180px tiles
// (127 MB for one X-Men search). scripts/build-cover-thumbs.mjs and the
// cover ingester write a 400px-wide WebP of each one to the cover-thumbs
// bucket at w400/<original storage path>.webp, with a one-year cache.
//
// The thumb path keeps the original's full path (extension included) so the
// mapping runs both ways: CoverThumbFallback swaps a thumb that has not been
// built yet back to its original. Detail pages (issue, comic) still show the
// original; only places that draw covers small should use this.

const ORIGINAL_MARKER = "/storage/v1/object/public/canonical-covers/";
const THUMB_MARKER = "/storage/v1/object/public/cover-thumbs/w400/";

export const THUMB_WIDTH = 400;

// Storage path of the thumb for an original's storage path.
export function thumbStoragePath(storagePath) {
  return `w${THUMB_WIDTH}/${storagePath}.webp`;
}

// Thumb URL for a canonical cover URL. Anything else (user uploads in
// comic-covers, /fallback-cover.png, null) comes back unchanged.
export function coverThumb(url) {
  if (typeof url !== "string") return url;
  const at = url.indexOf(ORIGINAL_MARKER);
  if (at < 0) return url;
  const pathEnd = url.search(/[?#]/);
  const path = url.slice(at + ORIGINAL_MARKER.length, pathEnd < 0 ? undefined : pathEnd);
  if (!path) return url;
  return `${url.slice(0, at)}${THUMB_MARKER}${path}.webp`;
}

// The original for a thumb URL, or null if `url` is not a thumb.
export function coverOriginal(url) {
  if (typeof url !== "string") return null;
  const at = url.indexOf(THUMB_MARKER);
  if (at < 0) return null;
  const pathEnd = url.search(/[?#]/);
  const path = url.slice(at + THUMB_MARKER.length, pathEnd < 0 ? undefined : pathEnd);
  if (!path.endsWith(".webp")) return null;
  return `${url.slice(0, at)}${ORIGINAL_MARKER}${path.slice(0, -".webp".length)}`;
}
