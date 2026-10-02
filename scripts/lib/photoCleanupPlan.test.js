import { test } from "node:test";
import assert from "node:assert/strict";
import { planCleanup } from "./photoCleanupPlan.js";

const now = Date.parse("2026-10-03T06:00:00Z");
const at = (hoursAgo) => new Date(now - hoursAgo * 3600 * 1000).toISOString();

test("stale originals go, fresh ones stay", () => {
  const plan = planCleanup({
    originals: [
      { path: "o/u/old", createdAt: at(30) },
      { path: "o/u/new", createdAt: at(2) },
      { path: "o/u/edge", createdAt: at(23.9) },
      { path: "o/u/nodate", createdAt: null },
    ],
    now,
  });
  assert.deepEqual(plan.originals, ["o/u/old"]);
});

test("only unreferenced public files past the grace window are orphans", () => {
  const referenced = new Set(["l/u/c/p1.webp", "l/u/c/p1.thumb.webp"]);
  const plan = planCleanup({
    publicFiles: [
      { path: "l/u/c/p1.webp", createdAt: at(500) },
      { path: "l/u/c/p1.thumb.webp", createdAt: at(500) },
      { path: "l/u/gone/p2.webp", createdAt: at(48) },
      { path: "l/u/gone/p2.thumb.webp", createdAt: at(48) },
      { path: "l/u/c/inflight.webp", createdAt: at(0.1) },
    ],
    referenced,
    now,
  });
  assert.deepEqual(plan.orphans, ["l/u/gone/p2.webp", "l/u/gone/p2.thumb.webp"]);
});

test("nothing to do is an empty plan", () => {
  assert.deepEqual(planCleanup({ now }), { originals: [], orphans: [] });
});
