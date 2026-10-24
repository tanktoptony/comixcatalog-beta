import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asOwner, createMultiOrder, newClient, seedListing, seedUser, startDatabase, stopDatabase, transition } from "./harness.js";

before(startDatabase);
after(stopDatabase);
async function client() { const db = newClient(); await db.connect(); return db; }
async function setup(db) {
  const sellerId = randomUUID(), buyerId = randomUUID();
  await seedUser(db, sellerId); await seedUser(db, buyerId);
  const a = await seedListing(db, { sellerId, priceCents: 1000, shippingCents: 500, issue: 8101 });
  const b = await seedListing(db, { sellerId, priceCents: 2000, shippingCents: 200, issue: 8102 });
  return { sellerId, buyerId, listings: [a, b] };
}
async function awaiting(db, value) {
  const order = await createMultiOrder(db, value.buyerId, value.listings.map((item) => item.listingId));
  return transition(db, order.id, "awaiting_payment", null, "system", { stripe_checkout_session_id: `cs_${order.id}` });
}
function payment(order) { return { stripe_checkout_session_id: order.stripe_checkout_session_id, amount_total: order.total_cents, currency: "usd", livemode: false, stripe_payment_intent_id: `pi_${order.id}`, stripe_charge_id: `ch_${order.id}`, ship_to: {} }; }

test("multi-item create computes combined shipping and fees", async () => {
  const db = await client(), value = await setup(db);
  const order = await createMultiOrder(db, value.buyerId, value.listings.map((item) => item.listingId));
  assert.equal(order.item_cents, 3000); assert.equal(order.shipping_cents, 600); assert.equal(order.total_cents, 3600);
  assert.equal(order.processing_fee_cents, 134); assert.equal(order.seller_net_cents, 3466);
  await asOwner(db); assert.equal((await db.query("select count(*)::int n from order_items where order_id=$1", [order.id])).rows[0].n, 2);
  await db.end();
});

test("multi-item create is all-or-nothing when one listing is taken", async () => {
  const db = await client(), value = await setup(db), otherBuyer = randomUUID(); await seedUser(db, otherBuyer);
  await createMultiOrder(db, value.buyerId, [value.listings[0].listingId]);
  await assert.rejects(() => createMultiOrder(db, otherBuyer, value.listings.map((item) => item.listingId)), { code: "55006" });
  await asOwner(db); assert.equal((await db.query("select status from listings where id=$1", [value.listings[1].listingId])).rows[0].status, "active");
  await db.end();
});

test("concurrent multi-item carts cannot share a listing", async () => {
  const seed = await client();
  const sellerId = randomUUID(), buyerA = randomUUID(), buyerB = randomUUID();
  await seedUser(seed, sellerId); await seedUser(seed, buyerA); await seedUser(seed, buyerB);
  const shared = await seedListing(seed, { sellerId, issue: 8201 });
  const a = await seedListing(seed, { sellerId, issue: 8202 });
  const b = await seedListing(seed, { sellerId, issue: 8203 });
  await seed.end();
  const results = await Promise.all([[buyerA, a], [buyerB, b]].map(async ([buyer, own]) => {
    const db = await client();
    try { await createMultiOrder(db, buyer, [shared.listingId, own.listingId]); return "ok"; }
    catch (error) { return error.code; }
    finally { await db.end(); }
  }));
  assert.equal(results.filter((result) => result === "ok").length, 1);
  assert.equal(results.filter((result) => result === "55006").length, 1);
});

test("paid, cancel, delivery, and full refund affect every copy", async () => {
  const db = await client(), value = await setup(db);
  const pending = await awaiting(db, value); const paid = await transition(db, pending.id, "paid", null, "stripe", payment(pending), null, randomUUID());
  await asOwner(db); assert.equal((await db.query("select count(*)::int n from sold_items where order_id=$1 and status='order_pending'", [paid.id])).rows[0].n, 2);
  await transition(db, paid.id, "refunded", value.sellerId, "seller", { amount_cents: paid.total_cents });
  await asOwner(db); assert.equal((await db.query("select count(*)::int n from user_collections where user_id=$1 and status='owned'", [value.sellerId])).rows[0].n, 2);
  const value2 = await setup(db); const reserved = await createMultiOrder(db, value2.buyerId, value2.listings.map((item) => item.listingId));
  await transition(db, reserved.id, "cancelled", value2.buyerId, "buyer");
  await asOwner(db); assert.equal((await db.query("select count(*)::int n from listings where id=any($1) and status='active'", [value2.listings.map((item) => item.listingId)])).rows[0].n, 2);
  await db.end();
});

test("expiry releases every listing in the order", async () => {
  const db = await client(), value = await setup(db);
  const order = await awaiting(db, value);
  await asOwner(db); await db.query("update orders set checkout_expires_at=now()-interval '1 minute' where id=$1", [order.id]);
  await transition(db, order.id, "cancelled", null, "system");
  await asOwner(db);
  assert.equal((await db.query("select count(*)::int n from listings where id=any($1) and status='active'", [value.listings.map((item) => item.listingId)])).rows[0].n, 2);
  await db.end();
});

test("a new seller's open-order cap applies to the whole multi-item order", async () => {
  const db = await client();
  const sellerId = randomUUID(), buyerId = randomUUID();
  await seedUser(db, sellerId); await seedUser(db, buyerId);
  // Each copy fits under the $2,000 cap on its own; together they don't.
  const a = await seedListing(db, { sellerId, priceCents: 90000, issue: 8301 });
  const b = await seedListing(db, { sellerId, priceCents: 90000, issue: 8302 });
  const c = await seedListing(db, { sellerId, priceCents: 90000, issue: 8303 });
  // Books at $100+ need front and back photos before they can be bought.
  await asOwner(db);
  for (const l of [a, b, c]) for (const kind of ["front", "back"]) {
    await db.query("insert into public.listing_photos(listing_id,collection_id,owner_id,storage_path,thumb_path,kind) values($1,$2,$3,$4,$4,$5)", [l.listingId, l.collectionId, sellerId, `${kind}-${randomUUID()}`, kind]);
  }
  await assert.rejects(() => createMultiOrder(db, buyerId, [a.listingId, b.listingId, c.listingId]), /new_seller_open_order_cap/);
  await asOwner(db);
  assert.equal((await db.query("select count(*)::int n from listings where id=any($1) and status='active'", [[a.listingId, b.listingId, c.listingId]])).rows[0].n, 3);
  await db.end();
});
