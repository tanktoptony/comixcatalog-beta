import test from "node:test";
import assert from "node:assert/strict";
import { hashFoundingToken, isFoundingTokenExpired, mapFoundingClaim } from "./foundingClaim.js";

test("token hashes are deterministic SHA-256 values without the raw token", () => {
  const hash = hashFoundingToken("secret-token");
  assert.equal(hash, "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94");
  assert.equal(hash.includes("secret-token"), false);
});

test("tokens expire at seven days", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  assert.equal(isFoundingTokenExpired("2026-10-06T12:00:01Z", now), false);
  assert.equal(isFoundingTokenExpired("2026-10-06T12:00:00Z", now), true);
});

test("maps the RPC row to the public claim response", () => {
  assert.deepEqual(mapFoundingClaim([{ claimed: true, pass_number: 32, remaining: 68, already: false }]), { ok: true, number: 32, remaining: 68 });
});
