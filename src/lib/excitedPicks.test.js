import assert from "node:assert/strict";
import test from "node:test";
import {
  EXCITED_PICKS,
  resolveExcitedPicks,
} from "./excitedPicks.js";

function series(id, cover = true) {
  return {
    id: `db-${id}`,
    gcdId: id,
    title: `Series ${id}`,
    cover: cover ? `https://example.com/${id}.webp` : null,
  };
}

test("keeps only series picks with a cover and always keeps the status pick", () => {
  const rows = new Map([
    [240077, series(240077)],
    [239340, series(239340, false)],
    [240351, series(240351)],
  ]);

  const result = resolveExcitedPicks(rows);

  assert.deepEqual(result.map((pick) => pick.key), [
    "midnight",
    "magneto",
    "forever-home",
  ]);
});

test("keeps every available Midnight cover in editorial order", () => {
  const rows = new Map([
    [240077, series(240077)],
    [240953, series(240953)],
    [240078, series(240078)],
  ]);
  const midnight = EXCITED_PICKS.find((pick) => pick.key === "midnight");

  const [result] = resolveExcitedPicks(rows, [
    midnight,
    EXCITED_PICKS[1],
    { ...EXCITED_PICKS[2], status: "Test status" },
  ]);

  assert.deepEqual(
    result.series.map((item) => item.gcdId),
    [240077, 240953, 240078]
  );
});

test("hides the section when fewer than three picks are showable", () => {
  const rows = new Map([[240077, series(240077)]]);

  assert.deepEqual(resolveExcitedPicks(rows, [
    EXCITED_PICKS[0],
    EXCITED_PICKS[1],
  ]), []);
});
