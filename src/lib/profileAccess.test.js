import test from "node:test";
import assert from "node:assert/strict";
import { getPrivateProfileView } from "./profileAccess.js";

test("missing profiles stay not found", () => {
  assert.equal(
    getPrivateProfileView({ exists: false, isPublic: false }),
    "not-found"
  );
});

test("public profiles use the public view", () => {
  assert.equal(
    getPrivateProfileView({ exists: true, isPublic: true }),
    "public"
  );
});

test("the owner can request the private owner view", () => {
  assert.equal(
    getPrivateProfileView({
      exists: true,
      isPublic: false,
      viewerUsername: "Collector",
      routeUsername: "collector",
    }),
    "owner"
  );
});

test("a non-owner cannot get the private owner view", () => {
  assert.equal(
    getPrivateProfileView({
      exists: true,
      isPublic: false,
      viewerUsername: "stranger",
      routeUsername: "collector",
    }),
    "private"
  );
});
