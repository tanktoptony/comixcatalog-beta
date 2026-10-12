// What the nightly listing-photo cleanup may delete. Pure, so it's tested
// separately from the script that lists and deletes (scripts/cleanupListingPhotos.js).
//
// - Originals (private bucket) older than 24h: an upload that was started
//   but never processed. A processed one is deleted by the process route.
// - Public photo files no listing_photos row points to, older than 1h:
//   left behind when a collection row is deleted (rows cascade, files
//   don't). The hour of grace covers the process route, which writes the
//   files a moment before it inserts the row.

export const ORIGINAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;

export function planCleanup({ originals = [], publicFiles = [], referenced = new Set(), now = Date.now() }) {
  const age = (f) => now - Date.parse(f.createdAt);
  const stale = originals.filter((f) => Number.isFinite(age(f)) && age(f) > ORIGINAL_MAX_AGE_MS).map((f) => f.path);
  const orphans = publicFiles
    .filter((f) => !referenced.has(f.path) && Number.isFinite(age(f)) && age(f) > ORPHAN_GRACE_MS)
    .map((f) => f.path);
  return { originals: stale, orphans };
}

// Photo files a private sold record (sold_items.seller_photo_keys, 0052)
// still points to. Their listing_photos rows are gone once a book is marked
// sold, so the cleanup must count these as referenced.
export function soldPhotoPaths(rows = []) {
  const paths = [];
  for (const row of rows) {
    for (const photo of Array.isArray(row?.seller_photo_keys) ? row.seller_photo_keys : []) {
      if (photo?.storage_path) paths.push(photo.storage_path);
      if (photo?.thumb_path) paths.push(photo.thumb_path);
    }
  }
  return paths;
}
