import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "./fetchWithRetry.js";

const noSleep = async () => {};
const ok = { ok: true };
const bad = { ok: false, status: 503 };

test("a failed first request is retried and the later success is returned", async () => {
  const results = [bad, new Error("network"), ok];
  let calls = 0;
  const res = await fetchWithRetry(async () => { const r = results[calls++]; if (r instanceof Error) throw r; return r; }, { sleep: noSleep });
  assert.equal(res, ok);
  assert.equal(calls, 3);
});

test("gives up with null after every attempt fails, without throwing", async () => {
  let calls = 0;
  const res = await fetchWithRetry(async () => { calls++; return bad; }, { delays: [1, 1], sleep: noSleep });
  assert.equal(res, null);
  assert.equal(calls, 3);
});

test("stops retrying once cancelled", async () => {
  let calls = 0, cancelled = false;
  const res = await fetchWithRetry(async () => { calls++; cancelled = true; return bad; }, { sleep: noSleep, isCancelled: () => cancelled });
  assert.equal(res, null);
  assert.equal(calls, 1);
});

test("a first-try success makes one request", async () => {
  let calls = 0;
  assert.equal(await fetchWithRetry(async () => { calls++; return ok; }, { sleep: noSleep }), ok);
  assert.equal(calls, 1);
});
