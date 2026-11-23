import { test } from "node:test";
import assert from "node:assert/strict";
import { cachedCard, cardCacheControl } from "./cache.js";

test("replaces the max-age=0 stamp with the route's window", async () => {
  // What next/og's ImageResponse sends by default.
  const render = async () => new Response("png", { headers: { "cache-control": "public, max-age=0, must-revalidate" } });
  const res = await cachedCard(604800, render)({ params: Promise.resolve({ id: "1" }) });
  assert.equal(res.headers.get("cache-control"), "s-maxage=604800, stale-while-revalidate=30931200");
  assert.equal(await res.text(), "png");
});

test("matches the header shape Next writes for ISR", () => {
  assert.equal(cardCacheControl(3600), "s-maxage=3600, stale-while-revalidate=31532400");
});

test("passes params through to the card", async () => {
  let seen;
  await cachedCard(60, async (props) => ((seen = props), new Response("")))({ params: "p" });
  assert.deepEqual(seen, { params: "p" });
});
