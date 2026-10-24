import { US_PUBLISHER_ALLOWLIST } from "./publisher.js";

// Publisher pages exist for the US publishers search already knows
// (US_PUBLISHER_ALLOWLIST). Any other publisher name stays plain text.

export function publisherSlug(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// slug -> exact resolved_publisher_cached value. First name wins on a
// collision (the Aardvark-Vanaheim spellings), which is the canonical one.
export const PUBLISHER_BY_SLUG = new Map();
for (const name of US_PUBLISHER_ALLOWLIST) {
  const slug = publisherSlug(name);
  if (slug && !PUBLISHER_BY_SLUG.has(slug)) PUBLISHER_BY_SLUG.set(slug, name);
}

const KNOWN = new Set(US_PUBLISHER_ALLOWLIST);

// "/publisher/marvel-comics" for a known publisher, else null.
export function publisherHref(name) {
  if (!name || !KNOWN.has(name)) return null;
  return `/publisher/${publisherSlug(name)}`;
}
