import assert from "node:assert/strict";
import test from "node:test";
import { createServerTiming } from "./serverTiming.js";

test("records async and synchronous phases in Server-Timing format", async () => {
  const readings = [10, 22.34, 30, 34.56];
  const timing = createServerTiming(() => readings.shift());

  assert.equal(await timing.measure("profile lookup", async () => "profile"), "profile");
  assert.equal(timing.measureSync("serialization", () => "json"), "json");
  assert.equal(
    timing.header(),
    "profile_lookup;dur=12.3, serialization;dur=4.6"
  );
});

test("clamps invalid manually recorded durations", () => {
  const timing = createServerTiming();
  timing.set("covers", -10);
  timing.set("values", Number.NaN);

  assert.equal(timing.header(), "covers;dur=0.0, values;dur=0.0");
});
