import { test } from "node:test";
import assert from "node:assert/strict";
import { coverPathFromUrl, coverUrlFromPath, estValue, toListing } from "./listingRow.js";

const BASE = "https://abc.supabase.co";

test("cover path round-trips through the public URL", () => {
  const path = "marvel/amazing-spider-man/300.jpg";
  const url = coverUrlFromPath(path, BASE);
  assert.equal(url, `${BASE}/storage/v1/object/public/canonical-covers/${path}`);
  assert.equal(coverPathFromUrl(url), path);
});

test("cover path ignores URLs from other buckets and empty input", () => {
  assert.equal(coverPathFromUrl(`${BASE}/storage/v1/object/public/comic-covers/library/x.jpg`), null);
  assert.equal(coverPathFromUrl(null), null);
  assert.equal(coverPathFromUrl(`${BASE}/storage/v1/object/public/canonical-covers/`), null);
  assert.equal(coverUrlFromPath(null, BASE), null);
});

test("cover path decodes encoded characters", () => {
  assert.equal(
    coverPathFromUrl(`${BASE}/storage/v1/object/public/canonical-covers/x-men%20annual/3.jpg`),
    "x-men annual/3.jpg"
  );
});

test("est value prefers the seller's value and skips zero or junk", () => {
  assert.equal(estValue({ market_value: 40, auto_market_value: 25 }), 40);
  assert.equal(estValue({ market_value: 0, auto_market_value: 25 }), 25);
  assert.equal(estValue({ market_value: "abc", auto_market_value: null }), null);
  assert.equal(estValue({ market_value: null, auto_market_value: "12.5" }), 12.5);
  assert.equal(estValue({}), null);
});

test("toListing maps a view row to the grid shape", () => {
  const l = toListing(
    {
      id: "L1",
      collection_id: "C1",
      gcd_issue_id: "123",
      series_title: "",
      issue_number: null,
      release_year: 1963,
      publisher: "Marvel Comics",
      variant_label: null,
      cover_path: null,
      condition: "VF",
      grade_numeric: "9.4",
      slab_company: "CGC",
      price_cents: 1250,
      market_value: null,
      auto_market_value: 30,
      seller_username: "tony",
      created_at: "2026-10-01T00:00:00Z",
    },
    BASE
  );
  assert.equal(l.title, "Untitled");
  assert.equal(l.issueNumber, "");
  assert.equal(l.gcdIssueId, 123);
  assert.equal(l.href, "/issue/gcd-123");
  assert.equal(l.grade, 9.4);
  assert.equal(l.cover, null);
  assert.equal(l.price, 12.5);
  assert.equal(l.estValue, 30);
  assert.equal(l.seller, "tony");
  assert.equal(l.shipping, null);
  assert.equal(l.acceptsOffers, true);
});

test("toListing carries shipping and the offers switch", () => {
  const l = toListing({ id: "L", gcd_issue_id: 1, series_title: "X", price_cents: 4000, shipping_cents: 0, accepts_offers: false, seller_username: "t" }, BASE);
  assert.equal(l.price, 40);
  assert.equal(l.shipping, 0);
  assert.equal(l.acceptsOffers, false);
});
