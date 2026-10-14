import test from "node:test";
import assert from "node:assert/strict";

import { SEARCH_SERIES_RPC, SEARCH_SERIES_RPC_V1, isMissingFunctionError, searchSeriesRpc } from "./searchRpc.js";

function fakeSupabase(responses) {
  const calls = [];
  return {
    calls,
    async rpc(name, params) {
      calls.push({ name, params });
      return responses[name];
    },
  };
}

const params = { normalized_term: "batman", allowed_publishers: ["DC Comics"], result_limit: 1000 };

test("uses v2 when it answers", async () => {
  const sb = fakeSupabase({ [SEARCH_SERIES_RPC]: { data: [{ id: "a" }], error: null } });
  const res = await searchSeriesRpc(sb, params);
  assert.deepEqual(res.data, [{ id: "a" }]);
  assert.deepEqual(sb.calls.map((c) => c.name), [SEARCH_SERIES_RPC]);
  assert.deepEqual(sb.calls[0].params, params);
});

test("falls back to v1 only when v2 is missing", async () => {
  const sb = fakeSupabase({
    [SEARCH_SERIES_RPC]: { data: null, error: { code: "PGRST202", message: "Could not find the function" } },
    [SEARCH_SERIES_RPC_V1]: { data: [{ id: "b" }], error: null },
  });
  const res = await searchSeriesRpc(sb, params);
  assert.deepEqual(res.data, [{ id: "b" }]);
  assert.deepEqual(sb.calls.map((c) => c.name), [SEARCH_SERIES_RPC, SEARCH_SERIES_RPC_V1]);
});

test("a timeout on v2 is returned, not retried on v1", async () => {
  const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
  const sb = fakeSupabase({ [SEARCH_SERIES_RPC]: { data: null, error: timeout } });
  const res = await searchSeriesRpc(sb, params);
  assert.equal(res.error, timeout);
  assert.equal(sb.calls.length, 1);
});

test("missing-function detection", () => {
  assert.equal(isMissingFunctionError({ code: "PGRST202" }), true);
  assert.equal(isMissingFunctionError({ code: "42883" }), true);
  assert.equal(isMissingFunctionError({ code: "57014" }), false);
  assert.equal(isMissingFunctionError(null), false);
});
