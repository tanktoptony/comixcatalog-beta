import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../scripts/migrations/0060_sale_transfers.sql", import.meta.url), "utf8");

test("confirmation is buyer-only, pending-only, and inserts one owned copy", () => {
  assert.match(sql, /sale\.buyer_id is distinct from p_buyer_id/i);
  assert.match(sql, /sale\.status <> 'pending_buyer'/i);
  assert.match(sql, /insert into public\.user_collections[\s\S]+?'owned'/i);
  assert.match(sql, /update public\.sold_items set status = 'confirmed'/i);
});

test("transfer copies copy fields and sale price but not private seller fields", () => {
  const confirm = sql.slice(sql.indexOf("create or replace function public.confirm_sale_transfer"));
  const insert = confirm.slice(confirm.indexOf("insert into public.user_collections"), confirm.indexOf("returning id into new_collection_id"));
  for (const field of ["variant_label", "condition", "grade_numeric", "slab_company", "slab_cert_number", "user_cover_url"]) assert.match(insert, new RegExp(field));
  assert.match(insert, /sale\.sale_price/);
  assert.doesNotMatch(insert, /sale\.notes|sale\.purchase_price/);
});

test("confirmation removes wantlist and preserves photo objects by adding references", () => {
  assert.match(sql, /insert into public\.listing_photos/);
  assert.match(sql, /delete from public\.user_collections[\s\S]+status = 'wishlist'/);
  assert.doesNotMatch(sql, /storage\.from[\s\S]*\.(remove|delete)\s*\(/i);
});

test("blocked users cannot be named and disputed sales never call confirmation", () => {
  assert.match(sql, /from public\.user_blocks/);
  assert.match(sql, /create or replace function public\.dispute_sale_transfer/);
});
