import { test } from "node:test";
import assert from "node:assert/strict";
import { pinIsWrong, samePublisherFamily } from "./pinTrust.js";

const wrong = { volumeIssues: 85, overlap: 0, volumePublisher: "Marvel", pinPublisher: "Federal", pinYearEnded: 1985, thisYear: 2026 };

test("a one-book foreign reprint cannot claim a US run", () => {
  assert.equal(pinIsWrong(wrong), true);
  assert.equal(pinIsWrong({ ...wrong, volumePublisher: "Image", pinPublisher: "Cross Cult", overlap: 0.2, pinYearEnded: 2018 }), true);
});

test("thin-mirror pins stay trusted", () => {
  // Absolute Batman: same publisher, still running, 1 of 23 issues indexed.
  assert.equal(pinIsWrong({ ...wrong, volumePublisher: "DC Comics", pinPublisher: "DC", overlap: 0.04 }), false);
  assert.equal(pinIsWrong({ ...wrong, pinYearEnded: null }), false);
  assert.equal(pinIsWrong({ ...wrong, pinYearEnded: 2025 }), false);
});

test("needs real evidence", () => {
  assert.equal(pinIsWrong({ ...wrong, overlap: 0.5 }), false);
  assert.equal(pinIsWrong({ ...wrong, volumeIssues: 4 }), false);
  assert.equal(pinIsWrong({ ...wrong, pinPublisher: null }), false);
  assert.equal(pinIsWrong({ ...wrong, volumePublisher: "" }), false);
});

test("a freed volume stays with its own publisher", () => {
  assert.equal(samePublisherFamily("Western Publishing", "Western"), true);
  assert.equal(samePublisherFamily("Caliber Comics", "Caliber Press"), true);
  assert.equal(samePublisherFamily("Lev Gleason", "Lev Gleason [1930s-1950s]"), true);
  assert.equal(samePublisherFamily("Yaffa / Page", "Toby"), false);
  assert.equal(samePublisherFamily("Eros Comix", "Fantagraphics"), false);
  assert.equal(samePublisherFamily(null, null), false);
});
