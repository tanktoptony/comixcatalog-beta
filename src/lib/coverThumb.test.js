import { test } from "node:test";
import assert from "node:assert/strict";
import { coverThumb, coverOriginal, thumbStoragePath } from "./coverThumb.js";

const BASE = "https://x.supabase.co/storage/v1/object/public";
const ORIG = `${BASE}/canonical-covers/comicvine/x-men/vol-1/1-issue-1.jpg`;
const THUMB = `${BASE}/cover-thumbs/w400/comicvine/x-men/vol-1/1-issue-1.jpg.webp`;

test("maps a canonical cover to its thumb and back", () => {
  assert.equal(coverThumb(ORIG), THUMB);
  assert.equal(coverOriginal(THUMB), ORIG);
  assert.equal(thumbStoragePath("comicvine/x-men/vol-1/1-issue-1.jpg"), "w400/comicvine/x-men/vol-1/1-issue-1.jpg.webp");
});

test("drops a query string rather than baking it into the path", () => {
  assert.equal(coverThumb(`${ORIG}?v=2`), THUMB);
});

test("leaves everything that is not a canonical cover alone", () => {
  for (const v of [null, undefined, "", "/fallback-cover.png", `${BASE}/comic-covers/abc.jpg`]) {
    assert.equal(coverThumb(v), v);
  }
  assert.equal(coverOriginal(ORIG), null);
  assert.equal(coverOriginal("/fallback-cover.png"), null);
});
