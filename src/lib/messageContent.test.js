import { test } from "node:test";
import assert from "node:assert/strict";
import { containsMessageUrl } from "./messageContent.js";

test("detects http, https, and www links", () => {
  assert.equal(containsMessageUrl("See http://example.com"), true);
  assert.equal(containsMessageUrl("See HTTPS://example.com/path"), true);
  assert.equal(containsMessageUrl("Try www.example.com"), true);
});

test("does not warn for ordinary text or email addresses", () => {
  assert.equal(containsMessageUrl("No link here"), false);
  assert.equal(containsMessageUrl("me@example.com"), false);
  assert.equal(containsMessageUrl(null), false);
});
