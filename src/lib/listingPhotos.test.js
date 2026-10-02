import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUploadRequest, ownsOriginal, originalPath, photoPaths, reorder, PHOTO_LIMITS } from "./listingPhotos.js";

const C = "11111111-2222-3333-4444-555555555555";
const U = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ok = { collectionId: C, contentType: "image/jpeg", size: 3_000_000 };

test("upload requests: type, size, quotas", () => {
  assert.deepEqual(checkUploadRequest(ok), {});
  assert.deepEqual(checkUploadRequest({ ...ok, contentType: "IMAGE/PNG" }), {});
  assert.match(checkUploadRequest({ ...ok, collectionId: "nope" }).error, /Pick a book/);
  assert.match(checkUploadRequest({ ...ok, contentType: "image/heic" }).error, /HEIC/);
  assert.match(checkUploadRequest({ ...ok, contentType: "image/gif" }).error, /JPEG, PNG or WebP/);
  assert.match(checkUploadRequest({ ...ok, size: 0 }).error, /empty/);
  assert.match(checkUploadRequest({ ...ok, size: PHOTO_LIMITS.maxBytes + 1 }).error, /15 MB/);
  assert.match(checkUploadRequest(ok, { copy: 10 }).error, /max of 10/);
  assert.deepEqual(checkUploadRequest(ok, { copy: 9 }), {}, "the 10th photo is still allowed");
  assert.match(checkUploadRequest(ok, { user: 200 }).error, /200-photo/);
  assert.match(checkUploadRequest(ok, { today: 50 }).error, /50 photos today/);
  assert.match(checkUploadRequest(null).error, /Pick a book/);
});

test("the process step only accepts the caller's own originals", () => {
  const p = originalPath(U, C);
  assert.equal(ownsOriginal(p, U), true);
  assert.equal(ownsOriginal(p, U.toUpperCase()), true);
  assert.equal(ownsOriginal(p, "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee"), false);
  assert.equal(ownsOriginal(`o/${U}/../${C}`, U), false);
  assert.equal(ownsOriginal(`l/${U}/${C}`, U), false);
  assert.equal(ownsOriginal(`o/${U}/${C}/x`, U), false);
});

test("photo paths are per copy and never reused", () => {
  const a = photoPaths(U, C, "p1");
  assert.equal(a.full, `l/${U}/${C}/p1.webp`);
  assert.equal(a.thumb, `l/${U}/${C}/p1.thumb.webp`);
});

test("reorder needs exactly this copy's photos", () => {
  assert.deepEqual(reorder(["a", "b", "c"], ["c", "a", "b"]), [
    { id: "c", sort_order: 0 },
    { id: "a", sort_order: 1 },
    { id: "b", sort_order: 2 },
  ]);
  assert.match(reorder(["a", "b"], ["a"]).error, /match/);
  assert.match(reorder(["a", "b"], ["a", "a"]).error, /match/);
  assert.match(reorder(["a", "b"], ["a", "x"]).error, /match/);
});
