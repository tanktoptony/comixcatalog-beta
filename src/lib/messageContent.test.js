import { test } from "node:test";
import assert from "node:assert/strict";
import { containsMessageUrl, findOffPlatformPaymentTerms } from "./messageContent.js";

test("detects http, https, and www links", () => {
  assert.equal(containsMessageUrl("See http://example.com"), true);
  assert.equal(containsMessageUrl("See HTTPS://example.com/path"), true);
  assert.equal(containsMessageUrl("Try www.example.com"), true);
});

test("detects off-platform payment terms", () => {
  const cases = [
    ["Pay Friends and Family", "Friends and Family"],
    ["friends & family works", "Friends and Family"],
    ["Use F&F", "Friends and Family"],
    ["FnF only", "Friends and Family"],
    ["send it by ZELLE", "Zelle"],
    ["my venmo is ready", "Venmo"],
    ["Cash App me", "Cash App"],
    ["cashapp works", "Cash App"],
    ["send $comicfan", "Cash App"],
    ["wire transfer", "wire transfer"],
    ["wire payment", "wire transfer"],
    ["bank wire", "wire transfer"],
    ["Western Union", "Western Union"],
    ["MoneyGram", "MoneyGram"],
    ["bitcoin", "crypto"],
    ["BTC", "crypto"],
    ["ETH", "crypto"],
    ["USDT", "crypto"],
    ["pay with crypto", "crypto"],
    ["buy gift cards", "gift card"],
  ];
  for (const [body, expected] of cases) {
    assert.ok(findOffPlatformPaymentTerms(body).includes(expected), body);
  }
});

test("avoids ordinary and comic-specific false positives", () => {
  const cases = [
    "That costs $5",
    "Gift of the Magi is a classic",
    "I watched The Wire",
    "This cover has wire binding",
    "Kryptonite hurts Superman",
    "venmographic is not a payment service",
    "cash application form",
    "family and friends read comics",
    null,
  ];
  for (const body of cases) {
    assert.deepEqual(findOffPlatformPaymentTerms(body), [], String(body));
  }
});

test("does not warn for ordinary text or email addresses", () => {
  assert.equal(containsMessageUrl("No link here"), false);
  assert.equal(containsMessageUrl("me@example.com"), false);
  assert.equal(containsMessageUrl(null), false);
});
