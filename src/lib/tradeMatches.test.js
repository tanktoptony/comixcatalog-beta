import test from "node:test";
import assert from "node:assert/strict";
import { shapeTradeMatches } from "./tradeMatches.js";

const books = new Map([[1, { id: 1, title: "A" }], [2, { id: 2, title: "B" }], [3, { id: 3, title: "C" }]]);

test("orders two-way first, then trade count, then total", () => {
  const rows = [
    { member_id: "a", username: "oneway", they_have: [1, 2, 3], you_have: [], they_have_trade: [1, 2] },
    { member_id: "b", username: "both", they_have: [1], you_have: [2], they_have_trade: [] },
    { member_id: "c", username: "trade", they_have: [1, 2], you_have: [], they_have_trade: [1, 2] },
  ];
  assert.deepEqual(shapeTradeMatches(rows, books).map((m) => m.username), ["both", "oneway", "trade"]);
});

test("sets twoWay and keeps openToTrade as a hydrated subset", () => {
  const [match] = shapeTradeMatches([{ member_id: "a", username: "sam", they_have: [1, 2], you_have: [3], they_have_trade: [2, 99] }], books);
  assert.equal(match.twoWay, true);
  assert.deepEqual(match.openToTrade, [2]);
});

test("returns empty input", () => assert.deepEqual(shapeTradeMatches([], books), []));

test("drops issue ids without hydrated summaries", () => {
  const [match] = shapeTradeMatches([{ member_id: "a", username: "sam", they_have: [1, 99], you_have: [], they_have_trade: [99] }], books);
  assert.deepEqual(match.theyHave.map((book) => book.id), [1]);
  assert.deepEqual(match.openToTrade, []);
});
