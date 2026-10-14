import test from "node:test";
import assert from "node:assert/strict";

import { SEARCH_SERIES_RPC, searchSeriesRpc } from "./searchRpc.js";

test("calls v2 with the caller's params and returns its result as-is", async () => {
  const calls = [];
  const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
  const sb = { rpc: async (name, params) => { calls.push({ name, params }); return { data: null, error: timeout }; } };
  const params = { normalized_term: "batman", allowed_publishers: ["DC Comics"], result_limit: 1000 };
  const res = await searchSeriesRpc(sb, params);
  assert.equal(SEARCH_SERIES_RPC, "search_series_by_relevance_v2");
  assert.deepEqual(calls, [{ name: "search_series_by_relevance_v2", params }]);
  assert.equal(res.error, timeout);
});
