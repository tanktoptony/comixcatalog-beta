import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMarkSold } from "./markSold.js";

const id = "11111111-1111-4111-8111-111111111111";

test("mark sold requires a positive price", () => {
  for (const salePrice of [undefined, "", 0, -1, "nope"]) {
    assert.ok(validateMarkSold({ collectionItemId: id, salePrice, soldVia: "offsite" }).error);
  }
});

test("mark sold accepts supported sale sources", () => {
  assert.deepEqual(validateMarkSold({ collectionItemId: id, salePrice: "24.50", soldVia: "comixcatalog_message" }), {
    value: { collectionItemId: id, salePrice: 24.5, soldVia: "comixcatalog_message", buyerId: null },
  });
  assert.equal(validateMarkSold({ collectionItemId: id, salePrice: "10.01", soldVia: "offsite" }).value.salePrice, 10.01);
  assert.ok(validateMarkSold({ collectionItemId: id, salePrice: 10, soldVia: "checkout" }).error);
});

test("sale RPC enforces ownership and writes the sold row before removing the copy", () => {
  const sql = readFileSync(new URL("../../scripts/migrations/0052_sold_history.sql", import.meta.url), "utf8");
  assert.match(sql, /where id = p_collection_item_id and user_id = p_seller_id\s+for update/i);
  const insertAt = sql.indexOf("insert into public.sold_items");
  const deleteAt = sql.indexOf("delete from public.user_collections");
  assert.ok(insertAt > -1 && deleteAt > insertAt, "the durable sale insert must precede collection removal in the RPC transaction");
  assert.match(sql, /revoke all on function public\.mark_item_sold[\s\S]+from public, anon, authenticated/i);
});
