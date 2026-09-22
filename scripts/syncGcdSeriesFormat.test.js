// Covers the retry policy added 2026-09-22 after every scheduled run of the
// GCD format sync died on a single 57014 and, thanks to a blanket
// continue-on-error, reported green while syncing nothing.
//
// The point of these cases is the failure modes, not the happy path: a
// transient error has to be retried, a real error has to fail fast (retrying
// a bad query just wastes the run), and exhausting the retries has to raise
// something that names the code and message.
//
// Run: npm run test:format-sync

import test from "node:test";
import assert from "node:assert/strict";

// The module builds a Supabase client at import time; give it something to
// build from so importing it in a test doesn't need a real .env.local.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";

const { isTransient, pageWithRetry } = await import("./syncGcdSeriesFormat.js");

test("isTransient recognises the errors that actually killed runs", () => {
  assert.equal(isTransient({ code: "57014", message: "canceling statement due to statement timeout" }), true);
  assert.equal(isTransient({ code: "PGRST002", message: "Could not query the database for the schema cache." }), true);
  assert.equal(isTransient({ message: "TypeError: fetch failed" }), true);
  assert.equal(isTransient({ message: "read ECONNRESET" }), true);
});

test("isTransient does not swallow real query bugs", () => {
  // 42P01 undefined_table, 42703 undefined_column, 22P02 bad input syntax.
  // Retrying any of these is pure waste, and hiding them is how a broken
  // query survives to production.
  assert.equal(isTransient({ code: "42P01", message: 'relation "gcd_seriez" does not exist' }), false);
  assert.equal(isTransient({ code: "42703", message: "column series.nope does not exist" }), false);
  assert.equal(isTransient({ code: "22P02", message: "invalid input syntax for type uuid" }), false);
  assert.equal(isTransient(null), false);
});

test("a transient failure is retried and the eventual success is returned", async () => {
  let calls = 0;
  const build = async () => {
    calls += 1;
    if (calls < 3) return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
    return { data: [{ gcd_id: 1 }], error: null };
  };
  const data = await pageWithRetry(build);
  assert.equal(calls, 3, "should have retried twice before succeeding");
  assert.deepEqual(data, [{ gcd_id: 1 }]);
});

test("a non-transient failure fails on the first attempt", async () => {
  let calls = 0;
  const build = async () => {
    calls += 1;
    return { data: null, error: { code: "42703", message: "column series.nope does not exist" } };
  };
  await assert.rejects(() => pageWithRetry(build), /42703 \| column series\.nope does not exist/);
  assert.equal(calls, 1, "a real query error must not be retried");
});

test("exhausting the retries raises an error naming the code and message", async () => {
  let calls = 0;
  const build = async () => {
    calls += 1;
    return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
  };
  // attempts=2 keeps the test fast; the backoff between them is 1s.
  await assert.rejects(
    () => pageWithRetry(build, 2),
    /series walk failed after retries: 57014 \| canceling statement due to statement timeout/
  );
  assert.equal(calls, 2);
});

test("a successful page with no rows comes back as an empty array, not null", async () => {
  // allSeriesRows ends its walk on `data.length < 1000`, so a null here
  // would throw instead of terminating the walk.
  const data = await pageWithRetry(async () => ({ data: null, error: null }));
  assert.deepEqual(data, []);
});
