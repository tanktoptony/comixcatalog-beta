import test from "node:test";
import assert from "node:assert/strict";
import { formatTag, formatTagTitle } from "./seriesFormat.js";

test("formatTag identifies collected-edition names and bindings", () => {
  assert.equal(formatTag({ name: "Fables", publishing_format: "collected edition", binding: "trade paperback" }), "TPB");
  assert.equal(formatTag({ name: "The Amazing Spider-Man Omnibus", publishing_format: "Collected Edition", binding: "hardcover with dustjacket" }), "Omnibus");
  assert.equal(formatTag({ name: "Absolute Batman", publishing_format: "ongoing series", binding: "saddle-stitched" }), null);
  assert.equal(formatTagTitle({ name: "Fables", publishing_format: "collected edition", binding: "softcover; trade paperback" }), "Trade paperback collected edition");
});

test("formatTag identifies non-collected formats in priority order", () => {
  assert.equal(formatTag({ name: "Marvel Treasury Edition", publishing_format: "ongoing series" }), "Treasury");
  assert.equal(formatTag({ name: "Super-Hero Digest", publishing_format: "magazine" }), "Digest");
  assert.equal(formatTag({ name: "Promo", publishing_format: "one-shot; giveaway" }), "Giveaway");
  assert.equal(formatTag({ name: "Special", publishing_format: "One-Shot" }), "One-shot");
  assert.equal(formatTag({ name: "Event", publishing_format: "miniseries" }), "Limited");
});
