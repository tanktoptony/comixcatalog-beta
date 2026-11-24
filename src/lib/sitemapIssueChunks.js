// Names and URLs for the issue files in the sitemap, with no Next.js or
// path-alias imports so this runs under node --test.

const NAME = /^issues-(\d{1,6})$/;

export function issueChunkName(chunk) {
  return `issues-${chunk}`;
}

// The chunk number in a file name, or null for anything that isn't one. The
// pattern keeps a crawler's made-up file name from reaching the database with
// a number too large for the integer column.
export function parseIssueChunkName(name) {
  const match = String(name ?? "").match(NAME);
  return match ? Number(match[1]) : null;
}

export function issueEntriesFromIds(ids, siteUrl) {
  return (ids ?? []).map((id) => ({ url: `${siteUrl}/issue/gcd-${id}` }));
}
