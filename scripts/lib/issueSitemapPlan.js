// Decisions for the nightly issue sitemap build, kept free of I/O for tests.

// Ids are unique, so a range this wide can never hold more URLs than Google's
// limit of 50,000 per file. The fullest range held 44,918 on 2026-11-04.
export const CHUNK_WIDTH = 50000;

// A run that finds fewer than this is broken, not a smaller catalog.
export const MIN_EXPECTED_URLS = 100000;

// Losing a fifth of the list in one night needs a person to look at it.
export const MAX_SHRINK = 0.2;

export function chunkForId(gcdId) {
  return Math.floor(Number(gcdId) / CHUNK_WIDTH);
}

// `existing` and `computed` are Maps of chunk number to a sorted id array.
// A chunk is written only when its list changed, so updated_at can serve as
// the file's <lastmod> in the sitemap index.
export function planWrites(existing, computed) {
  const upserts = [];
  for (const [chunk, ids] of computed) {
    const current = existing.get(chunk);
    const same = current?.length === ids.length && current.every((id, index) => id === ids[index]);
    if (!same) upserts.push(chunk);
  }
  const deletes = [...existing.keys()].filter((chunk) => !computed.has(chunk));
  return { upserts, deletes };
}

export function totalUrls(chunks) {
  let total = 0;
  for (const ids of chunks.values()) total += ids.length;
  return total;
}

// Returns the reason to refuse this run, or null when it looks sound.
export function refusalReason(existingTotal, computedTotal, { allowShrink = false } = {}) {
  if (computedTotal < MIN_EXPECTED_URLS) {
    return `found ${computedTotal} issues, expected at least ${MIN_EXPECTED_URLS}`;
  }
  if (!allowShrink && existingTotal > 0 && computedTotal < existingTotal * (1 - MAX_SHRINK)) {
    return `list would shrink from ${existingTotal} to ${computedTotal}; rerun with --allow-shrink if that is right`;
  }
  return null;
}
