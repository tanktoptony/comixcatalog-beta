import test from "node:test";
import assert from "node:assert/strict";
import { trackingUrl, validateTracking } from "./tracking.js";

test("tracking validates carriers, characters, and the threshold", () => {
  assert.equal(validateTracking({ carrier: "ups", tracking_number: "" }, 5000).ok, false);
  assert.equal(validateTracking({ carrier: "ups", tracking_number: "1Z 999 AA" }, 5000).ok, true);
  assert.equal(validateTracking({ carrier: "usps", tracking_number: "" }, 4999).ok, true);
  assert.equal(validateTracking({ carrier: "carrier", tracking_number: "12345678" }, 1).ok, false);
  assert.equal(validateTracking({ carrier: "ups", tracking_number: "1234!678" }, 1).ok, false);
});

test("tracking URLs use the official carrier destinations", () => {
  assert.match(trackingUrl("fedex", "1234 5678"), /fedex\.com/);
  assert.equal(trackingUrl("other", "12345678"), null);
});
