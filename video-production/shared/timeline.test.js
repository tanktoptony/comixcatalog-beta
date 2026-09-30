import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTime, normalizeTimeline, missingAssets } from "./timeline.js";

test("parses seconds and clock times", () => {
  assert.equal(parseTime(245), 245);
  assert.equal(parseTime("4:05"), 245);
  assert.equal(parseTime("1:02:03"), 3723);
  assert.throws(() => parseTime("4:xx"));
});

test("segments run to the next start; nudges shift everything after a point", () => {
  const tl = normalizeTimeline(
    {
      duration: "0:30",
      nudges: [{ from: "0:10", by: 1.5 }],
      segments: [
        { at: 0, type: "chapter" },
        { at: "0:10", type: "cover" },
        { at: "0:20", type: "cover", dur: 4 },
      ],
    },
    30
  );
  assert.deepEqual(tl.segments.map((s) => [s.start, s.end]), [[0, 11.5], [11.5, 21.5], [21.5, 25.5]]);
  assert.equal(tl.durationInFrames, 900);
  assert.equal(tl.segments[1].from, 345);
});

test("rejects out-of-order and overrunning segments", () => {
  assert.throws(() => normalizeTimeline({ duration: 20, segments: [{ at: 10 }, { at: 5 }] }, 30), /out of order/);
  assert.throws(() => normalizeTimeline({ duration: 20, segments: [{ at: 0, dur: 12 }, { at: 10 }] }, 30), /runs past/);
});

test("missing assets are listed once with every segment that uses them", () => {
  const ep = {
    id: "episode-001",
    segments: [
      { id: "a", at: 0, type: "cover", asset: "covers/have.jpg" },
      { id: "b", at: 5, type: "pair", assets: ["covers/have.jpg", "tas/TAS_GAMBIT.jpg"] },
      { id: "c", at: 9, type: "cover", asset: "tas/TAS_GAMBIT.jpg" },
    ],
  };
  const missing = missingAssets(ep, ["episode-001/covers/have.jpg"]);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].path, "episode-001/tas/TAS_GAMBIT.jpg");
  assert.deepEqual(missing[0].usedBy.map((u) => u.segment), ["b", "c"]);
});
