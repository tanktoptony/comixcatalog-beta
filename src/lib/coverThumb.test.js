import { test } from "node:test";
import assert from "node:assert/strict";
import { coverThumb, coverOriginal, coverTransform, thumbStoragePath } from "./coverThumb.js";

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

test("maps a missing thumb to Supabase's 400px image transform", () => {
  assert.equal(
    coverTransform(THUMB),
    `${BASE.replace("/object/public", "/render/image/public")}/canonical-covers/comicvine/x-men/vol-1/1-issue-1.jpg?width=400&quality=80`
  );
  assert.equal(coverTransform(ORIG), null);
});

test("leaves everything that is not a canonical cover alone", () => {
  for (const v of [null, undefined, "", "/fallback-cover.png", `${BASE}/comic-covers/abc.jpg`]) {
    assert.equal(coverThumb(v), v);
  }
  assert.equal(coverOriginal(ORIG), null);
  assert.equal(coverOriginal("/fallback-cover.png"), null);
});
