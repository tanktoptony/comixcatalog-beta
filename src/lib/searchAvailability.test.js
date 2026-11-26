import test from "node:test";
import assert from "node:assert/strict";
import { searchClientState, searchRoutePolicy } from "./searchAvailability.js";

test("total search failure returns 503 without caching", () => {
  assert.deepEqual(searchRoutePolicy({ failed: true }), {
    status: 503,
    cacheControl: "no-store",
  });
});

test("partial search failure stays successful but is not cached", () => {
  assert.deepEqual(searchRoutePolicy({ degraded: true }), {
    status: 200,
    cacheControl: "private, no-store",
  });
});

test("comic failure with series results is degraded", () => {
  assert.equal(searchClientState([
    { state: "failed", resultCount: 0 },
    { state: "ready", resultCount: 3 },
  ]), "degraded");
});

test("series failure with comic results is degraded", () => {
  assert.equal(searchClientState([
    { state: "ready", resultCount: 8 },
    { state: "failed", resultCount: 0 },
  ]), "degraded");
});

test("comic failure with an empty series response is failed", () => {
  assert.equal(searchClientState([
    { state: "failed", resultCount: 0 },
    { state: "ready", resultCount: 0 },
  ]), "failed");
});

test("series failure with an empty comic response is failed", () => {
  assert.equal(searchClientState([
    { state: "ready", resultCount: 0 },
    { state: "failed", resultCount: 0 },
  ]), "failed");
});

test("a failed later comic page keeps earlier comic results usable", () => {
  assert.equal(searchClientState([
    { state: "failed", resultCount: 36 },
    { state: "ready", resultCount: 0 },
  ]), "degraded");
});
