import assert from "node:assert/strict";
import test from "node:test";
import { cachedSearchTerm } from "./searchTermCache.js";

function fakeSupabase({ row = null, readError = null, claim = true } = {}) {
  const calls = [];
  return {
    calls,
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: row, error: readError }),
      };
      return chain;
    },
    rpc(name, params) {
      calls.push([name, params]);
      if (name === "claim_search_term_refresh") return Promise.resolve({ data: claim, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const now = () => Date.parse("2026-10-14T12:00:00Z");

test("fresh row is served without computing", async () => {
  const supabase = fakeSupabase({ row: { payload: { series: [1] }, computed_at: "2026-10-14T11:55:00Z" } });
  let computed = 0;
  const out = await cachedSearchTerm(supabase, {
    kind: "series", key: "batman", now,
    compute: async () => { computed += 1; return { series: [2] }; },
    fallback: async () => { throw new Error("no fallback"); },
  });
  assert.deepEqual(out, { result: { series: [1] }, state: "hit" });
  await settle();
  assert.equal(computed, 0);
  assert.deepEqual(supabase.calls, []);
});

test("stale row is served now and refreshed once in the background", async () => {
  const supabase = fakeSupabase({ row: { payload: { series: [1] }, computed_at: "2026-10-14T11:00:00Z" } });
  let computed = 0;
  const out = await cachedSearchTerm(supabase, {
    kind: "series", key: "batman", now,
    compute: async () => { computed += 1; return { series: [2] }; },
    fallback: async () => { throw new Error("no fallback"); },
  });
  assert.deepEqual(out, { result: { series: [1] }, state: "stale" });
  await settle();
  assert.equal(computed, 1);
  assert.deepEqual(supabase.calls.map(([name]) => name), ["claim_search_term_refresh", "save_search_term"]);
  assert.deepEqual(supabase.calls[1][1], { p_kind: "series", p_key: "batman", p_payload: { series: [2] } });
});

test("stale row already being refreshed elsewhere is not recomputed", async () => {
  const supabase = fakeSupabase({ row: { payload: {}, computed_at: "2026-10-14T11:00:00Z" }, claim: false });
  let computed = 0;
  await cachedSearchTerm(supabase, {
    kind: "comics", key: "x", now,
    compute: async () => { computed += 1; return {}; },
    fallback: async () => ({}),
  });
  await settle();
  assert.equal(computed, 0);
});

test("miss computes in the request and saves, degraded results are never saved", async () => {
  const ok = fakeSupabase();
  const out = await cachedSearchTerm(ok, {
    kind: "comics", key: "thor", now,
    compute: async () => ({ comics: [1] }),
    fallback: async () => ({}),
  });
  assert.deepEqual(out, { result: { comics: [1] }, state: "miss" });
  await settle();
  assert.deepEqual(ok.calls.map(([name]) => name), ["save_search_term"]);

  const degraded = fakeSupabase();
  const bad = await cachedSearchTerm(degraded, {
    kind: "comics", key: "thor", now,
    compute: async () => ({ comics: [], degraded: true }),
    fallback: async () => ({}),
  });
  assert.equal(bad.result.degraded, true);
  await settle();
  assert.deepEqual(degraded.calls, []);
});

test("unreadable table uses the fallback", async () => {
  const supabase = fakeSupabase({ readError: { code: "42P01", message: "missing" } });
  const original = console.error;
  console.error = () => {};
  try {
    const out = await cachedSearchTerm(supabase, {
      kind: "series", key: "x", now,
      compute: async () => { throw new Error("should not compute"); },
      fallback: async () => ({ series: ["legacy"] }),
    });
    assert.deepEqual(out, { result: { series: ["legacy"] }, state: "fallback" });
  } finally {
    console.error = original;
  }
});
