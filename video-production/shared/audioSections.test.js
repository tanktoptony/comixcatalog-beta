import test from "node:test";
import assert from "node:assert/strict";
import { sectionBoundaries } from "./audioSections.js";

test("section boundaries accumulate sorted recording durations", () => {
  assert.deepEqual(sectionBoundaries(["01-hook.wav", "02-setup.m4a", "03-end.mp3"], [5.1254, 10, 2.5]), [
    { id: "01-hook", file: "01-hook.wav", start: 0, end: 5.125 },
    { id: "02-setup", file: "02-setup.m4a", start: 5.125, end: 15.125 },
    { id: "03-end", file: "03-end.mp3", start: 15.125, end: 17.625 },
  ]);
});
