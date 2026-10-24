import { test } from "node:test";
import assert from "node:assert/strict";
import { PUBLISHER_BY_SLUG, publisherHref, publisherSlug } from "./publisherPages.js";

test("slugs are clean and round-trip to the exact publisher name", () => {
  assert.equal(publisherSlug("BOOM! Studios"), "boom-studios");
  assert.equal(publisherSlug("Devil's Due"), "devil-s-due");
  assert.equal(PUBLISHER_BY_SLUG.get("marvel-comics"), "Marvel Comics");
  assert.equal(PUBLISHER_BY_SLUG.get("boom-studios"), "BOOM! Studios");
});

test("only known publishers get a link", () => {
  assert.equal(publisherHref("Oni Press"), "/publisher/oni-press");
  assert.equal(publisherHref("Canam Publishers Sales Corp."), null);
  assert.equal(publisherHref(null), null);
});
