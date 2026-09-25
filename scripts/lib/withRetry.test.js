// The errors here are the ones that actually came out of GitHub Actions, not
// invented ones. 57014 is what failed the cover-ingest run at 2026-09-25
// 07:00 UTC and the two runs before it.

import test from "node:test";
import assert from "node:assert/strict";
import { withRetry, isTransient, DEFAULT_BACKOFF_MS } from "./withRetry.js";

const TIMEOUT = { code: "57014", message: "canceling statement due to statement timeout" };
const quiet = () => {};

function scripted(results) {
  let i = 0;
  const calls = [];
  const thunk = async () => {
    const r = results[Math.min(i, results.length - 1)];
    calls.push(i);
    i += 1;
    return r;
  };
  return { thunk, count: () => i, calls };
}

test("a statement timeout is transient; a data mistake is not", () => {
  assert.ok(isTransient(TIMEOUT));
  assert.ok(isTransient({ code: "53300", message: "too many connections" }));
  assert.ok(isTransient({ message: "fetch failed" }));
  assert.ok(isTransient({ code: "ETIMEDOUT" }));

  // PGRST116 means .single() matched a row count that was not one. It is a
  // fact about the data, true again on every retry. The three scripts this
  // helper replaces all listed it as retryable.
  assert.ok(!isTransient({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }));
  assert.ok(!isTransient({ code: "22P02", message: 'invalid input syntax for type uuid: "null"' }));
  assert.ok(!isTransient({ code: "42P01", message: "relation does not exist" }));
  assert.ok(!isTransient(null));
});

test("an empty error object counts as a hiccup, because that is what one looked like", () => {
  // The 2026-09-22 stall check logged "unknown error" four times: an error
  // with neither code nor message.
  assert.ok(isTransient({}));
});

test("one timeout then success returns the data, and costs one backoff", async () => {
  const { thunk, count } = scripted([{ error: TIMEOUT }, { data: [1, 2, 3], error: null }]);
  const slept = [];
  const out = await withRetry("page 0", thunk, { sleep: async (ms) => slept.push(ms), log: quiet });
  assert.deepEqual(out, [1, 2, 3]);
  assert.equal(count(), 2);
  assert.deepEqual(slept, [1000]);
});

test("backoff grows and gives up after four attempts", async () => {
  const { thunk, count } = scripted([{ error: TIMEOUT }]);
  const slept = [];
  await assert.rejects(
    () => withRetry("page 0", thunk, { sleep: async (ms) => slept.push(ms), log: quiet }),
    (err) => err.code === "57014"
  );
  assert.equal(count(), 4, "four attempts, not five");
  assert.deepEqual(slept, DEFAULT_BACKOFF_MS);
});

test("a permanent error throws immediately instead of burning 12 seconds", async () => {
  const permanent = { code: "42703", message: "column does not exist" };
  const { thunk, count } = scripted([{ error: permanent }]);
  const slept = [];
  await assert.rejects(
    () => withRetry("page 0", thunk, { sleep: async (ms) => slept.push(ms), log: quiet }),
    (err) => err.code === "42703"
  );
  assert.equal(count(), 1);
  assert.deepEqual(slept, [], "no backoff for an error that will not change");
});

test("a sustained outage still fails, and is not papered over", async () => {
  // 2026-09-22: the scripts that retry exhausted all four attempts and
  // failed anyway. Retry must not turn a real outage into a silent pass.
  const { thunk } = scripted([{ error: TIMEOUT }]);
  await assert.rejects(() => withRetry("page 0", thunk, { sleep: async () => {}, log: quiet }));
});

test("an empty result set is data, not a failure", async () => {
  // fetchAllPages stops when a page comes back empty. If that were treated
  // as an error the walk would retry four times at every natural end.
  const { thunk, count } = scripted([{ data: [], error: null }]);
  assert.deepEqual(await withRetry("page 0", thunk, { log: quiet }), []);
  assert.equal(count(), 1);
});

test("the label reaches the log, so the next failure says which page", async () => {
  const { thunk } = scripted([{ error: TIMEOUT }, { data: [], error: null }]);
  const lines = [];
  await withRetry("keyset page 41 (after abc)", thunk, {
    sleep: async () => {},
    log: (m) => lines.push(m),
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /keyset page 41 \(after abc\)/);
  assert.match(lines[0], /attempt 1\/4/);
  assert.match(lines[0], /statement timeout/);
});
