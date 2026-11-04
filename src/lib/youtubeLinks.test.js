// Per-video YouTube links. Run: npm run test:youtube-links

import test from "node:test";
import assert from "node:assert/strict";

import { parseAttribution, sanitizeSavedAttribution } from "./attribution.js";
import { YOUTUBE_LINKS, youtubeRedirects } from "./youtubeLinks.js";

const named = () => youtubeRedirects().filter((r) => !r.source.includes(":"));
const landingParams = (redirect) => new URL(redirect.destination, "https://www.comixcatalog.com");

test("every named link saves source=youtube and its own campaign through real attribution", () => {
  assert.ok(named().length > 0);
  for (const redirect of named()) {
    const slug = redirect.source.replace("/yt/", "");
    const url = landingParams(redirect);
    const saved = sanitizeSavedAttribution(parseAttribution(url.searchParams, url.pathname));
    assert.equal(saved.source, "youtube", redirect.source);
    assert.equal(saved.medium, "video", redirect.source);
    // A campaign that fails the slug check would be dropped silently and the
    // signup would lose its video.
    assert.equal(saved.campaign, `yt-${slug}`, redirect.source);
    assert.equal(saved.landing_path, url.pathname.slice(0, 64), redirect.source);
  }
});

test("slugs match the pattern a person could type, and each lands on a real path", () => {
  for (const [slug, path] of Object.entries(YOUTUBE_LINKS)) {
    assert.match(slug, /^[a-z0-9-]{2,40}$/);
    assert.match(path, /^\/[^?#]*$/, `${slug} destination must be a bare path; tags are added for it`);
  }
});

// Learned the hard way: /issue/17043 redirects to /issue/gcd-17043 before the
// page runs, and that redirect drops the query string, so the visit saves no
// source. Link straight to the canonical address.
test("issue destinations use the canonical gcd- address, so the tags survive", () => {
  for (const [slug, path] of Object.entries(YOUTUBE_LINKS)) {
    if (path.startsWith("/issue/")) assert.match(path, /^[/]issue[/]gcd-[0-9]+$/, slug);
  }
});

test("Doom lands on the founding page, because the video's end line promises that offer", () => {
  assert.equal(YOUTUBE_LINKS.doom, "/founding-collectors");
});

test("unknown slugs fall through to the founding page, still tagged, after the named links", () => {
  const all = youtubeRedirects();
  const fallback = all.at(-1);
  assert.equal(fallback.source, "/yt/:video([a-z0-9-]{2,40})");
  assert.equal(fallback.destination, "/founding-collectors?utm_source=youtube&utm_medium=video&utm_campaign=yt-:video");
  assert.equal(all.findIndex((r) => r.source.includes(":")), all.length - 1, "the pattern has to come last or it swallows the named links");
});

test("every redirect is temporary so a destination can change after a video is published", () => {
  for (const redirect of youtubeRedirects()) assert.equal(redirect.permanent, false, redirect.source);
});
