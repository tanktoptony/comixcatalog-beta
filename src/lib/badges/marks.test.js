import test from "node:test";
import assert from "node:assert/strict";
import { BADGE_CATALOG } from "./catalog.js";
import { ICON_MARKS, markSvg } from "./marks.js";

// A mark is either drawn artwork or a short label. A lowercase word that
// isn't a known icon would print as text (the "HEART" patch, 2026-10-23).
test("every badge mark is a drawn icon, the founding number, or a short label", () => {
  for (const badge of BADGE_CATALOG) {
    if (ICON_MARKS.includes(badge.mark) || badge.mark === "founding") continue;
    assert.match(String(badge.mark), /^[A-Z0-9.+]{1,6}$/, `${badge.id} mark "${badge.mark}" is neither an icon nor a short label`);
  }
});

test("icon marks render artwork, not their name", () => {
  for (const mark of ICON_MARKS) {
    const svg = markSvg({ mark, shape: "circle" });
    assert.ok(!svg.includes(`>${mark}<`), `${mark} printed as text`);
  }
});
