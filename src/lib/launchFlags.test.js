// The founding pass is the mechanism that turns the paywall on by itself at
// 100 signups. What matters is that running out is ordinary, not an error:
// a signup must never fail because the promo is over.
//
// Run: npm run test:launch-flags

import test from "node:test";
import assert from "node:assert/strict";

import { claimFoundingPass, launchProfileFlags } from "./launchFlags.js";

const ok = (body) => async () => ({ ok: true, json: async () => body });
const status = (code) => async () => ({ ok: false, status: code, json: async () => ({}) });

test("a granted pass reports itself claimed, with what is left", async () => {
  const r = await claimFoundingPass(ok({ ok: true, cap: 100, claimed: 28, remaining: 72 }));
  assert.deepEqual(r, { claimed: true, remaining: 72 });
});

test("all 100 gone is a normal outcome, not a thrown error", async () => {
  // This is the whole point of the change: signup 101 lands on free and
  // meets the upgrade page, rather than the signup blowing up.
  const r = await claimFoundingPass(status(409));
  assert.deepEqual(r, { claimed: false, remaining: 0 });
});

test("an unauthenticated or failed call still lets the signup finish", async () => {
  assert.deepEqual(await claimFoundingPass(status(401)), { claimed: false, remaining: 0 });
  assert.deepEqual(await claimFoundingPass(status(500)), { claimed: false, remaining: 0 });
});

test("a network failure costs a promo, never an account", async () => {
  const boom = async () => {
    throw new Error("network down");
  };
  assert.deepEqual(await claimFoundingPass(boom), { claimed: false, remaining: 0 });
});

test("malformed success is treated as not claimed rather than trusted", async () => {
  assert.deepEqual(await claimFoundingPass(ok({})), { claimed: false, remaining: 0 });
  assert.deepEqual(await claimFoundingPass(ok(null)), { claimed: false, remaining: 0 });
});

test("the client no longer hands itself any entitlements", async () => {
  // It used to return { is_pro: true, is_founding_collector: true } for the
  // browser to stamp onto its own row, which is what made the cap
  // unenforceable.
  assert.deepEqual(launchProfileFlags(), {});
});
