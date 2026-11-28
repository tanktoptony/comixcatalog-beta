import assert from "node:assert/strict";
import test from "node:test";
import { planComicCollectionLinks } from "./linkComicsToGcd.js";

const comic = (overrides = {}) => ({
  id: "comic-1",
  series_title: "The Example",
  issue_number: "1",
  review_status: "approved",
  gcd_id: 101,
  ...overrides,
});
const collection = (overrides = {}) => ({
  id: "collection-1",
  user_id: "user-1",
  comic_id: "comic-1",
  gcd_issue_id: null,
  status: "for_sale",
  condition: "Near Mint",
  grade_numeric: 9.8,
  slab_company: "CGC",
  slab_cert_number: "123",
  variant_label: "Newsstand",
  user_cover_url: null,
  ...overrides,
});

test("plans the catalog-link update shape and preserves listing fields", () => {
  const plan = planComicCollectionLinks({
    collections: [collection()],
    comics: [comic()],
    gcdIssues: [{ gcd_id: 101 }],
    profiles: [{ id: "user-1", username: "reader" }],
    covers: [
      { comic_id: "comic-1", image_path: "old.jpg", is_primary: false, created_at: "2025-01-01" },
      { comic_id: "comic-1", image_path: "primary.jpg", is_primary: true, created_at: "2025-02-01" },
    ],
  });

  assert.equal(plan.skips.length, 0);
  assert.equal(plan.changes[0].username, "reader");
  assert.deepEqual(plan.changes[0].update, {
    gcd_issue_id: 101,
    comic_id: null,
    user_cover_url: "primary.jpg",
  });
  assert.deepEqual(plan.changes[0].preserved, {
    condition: "Near Mint",
    grade_numeric: 9.8,
    slab_company: "CGC",
    slab_cert_number: "123",
    variant_label: "Newsstand",
  });
  assert.equal(plan.changes[0].listingSync, true);
});

test("keeps an existing personal cover instead of replacing it", () => {
  const plan = planComicCollectionLinks({
    collections: [collection({ user_cover_url: "mine.jpg" })],
    comics: [comic()],
    gcdIssues: [{ gcd_id: 101 }],
    covers: [{ comic_id: "comic-1", image_path: "comic.jpg", is_primary: true }],
  });
  assert.deepEqual(plan.changes[0].update, { gcd_issue_id: 101, comic_id: null });
});

test("refuses existing and within-plan destination collisions", () => {
  const rows = [
    collection({ id: "collection-1" }),
    collection({ id: "collection-2" }),
    collection({ id: "collection-3", user_id: "user-2" }),
  ];
  const plan = planComicCollectionLinks({
    collections: rows,
    comics: [comic()],
    gcdIssues: [{ gcd_id: 101 }],
    existingLinks: [{ id: "existing", user_id: "user-2", gcd_issue_id: 101 }],
  });
  assert.deepEqual(plan.changes.map((entry) => entry.collectionId), ["collection-1"]);
  assert.deepEqual(plan.skips.map((entry) => [entry.collectionId, entry.reason]), [
    ["collection-2", "collision"],
    ["collection-3", "collision"],
  ]);
});

test("reports rows the route or database would refuse", () => {
  const plan = planComicCollectionLinks({
    collections: [
      collection({ id: "missing-target", comic_id: "comic-missing-target" }),
      collection({ id: "open-order" }),
      collection({ id: "unapproved", comic_id: "comic-unapproved" }),
    ],
    comics: [
      comic(),
      comic({ id: "comic-missing-target", gcd_id: 999 }),
      comic({ id: "comic-unapproved", review_status: "pending" }),
    ],
    gcdIssues: [{ gcd_id: 101 }],
    blockedCollectionIds: ["open-order"],
  });
  assert.deepEqual(plan.skips.map((entry) => [entry.collectionId, entry.reason]), [
    ["missing-target", "gcd_issue_not_found"],
    ["open-order", "open_order"],
    ["unapproved", "comic_not_approved"],
  ]);
});
