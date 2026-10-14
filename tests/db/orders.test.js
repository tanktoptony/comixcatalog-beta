import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  asOwner, asService, asUser, createOrder, newClient, seedListing, seedUser,
  startDatabase, stopDatabase, transition,
} from "./harness.js";

before(async () => startDatabase());
after(async () => stopDatabase());

async function client() {
  const value = newClient();
  await value.connect();
  return value;
}

async function parties(db, options = {}) {
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  await seedUser(db, sellerId);
  await seedUser(db, buyerId);
  const listing = await seedListing(db, { sellerId, ...options });
  return { sellerId, buyerId, ...listing };
}

async function awaiting(db, setup) {
  const order = await createOrder(db, setup.buyerId, setup.listingId);
  return transition(db, order.id, "awaiting_payment", null, "system", { stripe_checkout_session_id: `cs_${order.id}` });
}

function payment(order, overrides = {}) {
  return {
    stripe_checkout_session_id: order.stripe_checkout_session_id,
    amount_total: order.total_cents,
    currency: "usd",
    livemode: false,
    stripe_payment_intent_id: `pi_${order.id}`,
    stripe_charge_id: `ch_${order.id}`,
    ship_to: { name: "Buyer", line1: "1 Main St" },
    ...overrides,
  };
}

async function paid(db, setup, eventId = `evt_${randomUUID()}`) {
  const order = await awaiting(db, setup);
  return transition(db, order.id, "paid", null, "stripe", payment(order), null, eventId);
}

test("20 concurrent buyers produce exactly one order", async () => {
  const setupDb = await client();
  const sellerId = randomUUID();
  await seedUser(setupDb, sellerId);
  const { listingId } = await seedListing(setupDb, { sellerId });
  const buyerIds = Array.from({ length: 20 }, () => randomUUID());
  for (const id of buyerIds) await seedUser(setupDb, id);
  await setupDb.end();

  const results = await Promise.all(buyerIds.map(async (id) => {
    const db = await client();
    try {
      await createOrder(db, id, listingId, id);
      return "ok";
    } catch (error) {
      return error.code;
    } finally {
      await db.end();
    }
  }));
  assert.equal(results.filter((result) => result === "ok").length, 1);
  assert.equal(results.filter((result) => result === "55006" || result === "23505").length, 19);
  const check = await client();
  assert.equal((await check.query("select count(*)::int n from public.orders where listing_id=$1", [listingId])).rows[0].n, 1);
  assert.equal((await check.query("select status from public.listings where id=$1", [listingId])).rows[0].status, "reserved");
  await check.end();
});

test("order amounts come only from the locked listing and signature has no amount parameter", async () => {
  const db = await client();
  const a = await parties(db, { priceCents: 1000, shippingCents: 125, issue: 11 });
  const b = await parties(db, { priceCents: 2000, shippingCents: 250, issue: 12 });
  await asOwner(db);
  await db.query("update public.listings set price_cents=3333 where id=$1", [b.listingId]);
  assert.equal((await createOrder(db, a.buyerId, a.listingId)).total_cents, 1125);
  assert.equal((await createOrder(db, b.buyerId, b.listingId)).total_cents, 3583);
  await asOwner(db);
  const args = (await db.query("select proargnames from pg_proc where oid='public.order_create(uuid,uuid,text)'::regprocedure")).rows[0].proargnames;
  assert.deepEqual(args, ["p_buyer", "p_listing", "p_request_id"]);
  await db.end();
});

test("tampered payment fields roll back without an audit row", async () => {
  for (const override of [
    { amount_total: 1 }, { amount_total: "not-cents" }, { stripe_checkout_session_id: "wrong" },
    { currency: "eur" }, { livemode: true }, { livemode: "not-a-boolean" },
  ]) {
    const db = await client();
    const setup = await parties(db, { issue: Math.floor(Math.random() * 100000) + 100 });
    const order = await awaiting(db, setup);
    await asOwner(db);
    const before = (await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1", [order.id])).rows[0].n;
    await assert.rejects(() => transition(db, order.id, "paid", null, "stripe", payment(order, override), null, randomUUID()), { code: "22023" });
    await asOwner(db);
    assert.equal((await db.query("select status from public.orders where id=$1", [order.id])).rows[0].status, "awaiting_payment");
    assert.equal((await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1", [order.id])).rows[0].n, before);
    await db.end();
  }
});

test("paid webhook replay is idempotent", async () => {
  const db = await client();
  const setup = await parties(db);
  const order = await awaiting(db, setup);
  const eventId = `evt_${randomUUID()}`;
  const first = await transition(db, order.id, "paid", null, "stripe", payment(order), null, eventId);
  const second = await transition(db, order.id, "paid", null, "stripe", payment(order), null, eventId);
  assert.equal(second.id, first.id);
  await asOwner(db);
  assert.equal((await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1 and action='transition:awaiting_payment->paid'", [order.id])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.sold_items where order_id=$1", [order.id])).rows[0].n, 1);
  await db.end();
});

test("wrong parties and disallowed roles cannot transition", async () => {
  const db = await client();
  const setup = await parties(db, { priceCents: 6000 });
  const order = await paid(db, setup);
  const shipped = await transition(db, order.id, "shipped", setup.sellerId, "seller", { tracking_number: "12345678", tracking_carrier: "usps" });
  await asOwner(db);
  const before = (await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1", [order.id])).rows[0].n;
  await assert.rejects(() => transition(db, shipped.id, "delivered", setup.sellerId, "seller"), { code: "55000" });
  const third = randomUUID();
  await seedUser(db, third);
  await assert.rejects(() => transition(db, shipped.id, "delivered", third, "buyer"), { code: "42501" });
  const delivered = await transition(db, shipped.id, "delivered", setup.buyerId, "buyer");
  await assert.rejects(() => transition(db, delivered.id, "completed", setup.sellerId, "seller"), { code: "55000" });
  const setup2 = await parties(db, { issue: 9991 });
  const paid2 = await paid(db, setup2);
  await assert.rejects(() => transition(db, paid2.id, "shipped", setup2.buyerId, "buyer"), { code: "55000" });
  await asOwner(db);
  const afterRejected = (await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1", [order.id])).rows[0].n;
  assert.equal(afterRejected, before + 1);
  await db.end();
});

test("order RLS and shipping address access are party-safe", async () => {
  const db = await client();
  const setup = await parties(db);
  const third = randomUUID();
  await seedUser(db, third);
  const order = await awaiting(db, setup);
  await asUser(db, third);
  assert.equal((await db.query("select id from public.orders where id=$1", [order.id])).rowCount, 0);
  await asUser(db, setup.buyerId);
  assert.equal((await db.query("select id from public.orders where id=$1", [order.id])).rowCount, 1);
  await assert.rejects(() => db.query("select ship_to from public.orders where id=$1", [order.id]), { code: "42501" });
  assert.equal((await db.query("select public.order_ship_to($1) value", [order.id])).rows[0].value, null);
  const complete = await transition(db, order.id, "paid", null, "stripe", payment(order), null, randomUUID());
  await asUser(db, setup.sellerId);
  await assert.rejects(() => db.query("select ship_to from public.orders where id=$1", [order.id]), { code: "42501" });
  assert.deepEqual((await db.query("select public.order_ship_to($1) value", [complete.id])).rows[0].value, payment(order).ship_to);
  await asUser(db, setup.buyerId);
  assert.equal((await db.query("select public.order_ship_to($1) value", [complete.id])).rows[0].value, null);
  await db.end();
});

test("collection guard blocks reserved deletion and permits it after cancellation", async () => {
  const db = await client();
  const setup = await parties(db);
  const order = await createOrder(db, setup.buyerId, setup.listingId);
  await asOwner(db);
  await assert.rejects(() => db.query("delete from public.user_collections where id=$1", [setup.collectionId]), { code: "55006" });
  await transition(db, order.id, "cancelled", setup.buyerId, "buyer");
  await asOwner(db);
  assert.equal((await db.query("delete from public.user_collections where id=$1", [setup.collectionId])).rowCount, 1);
  await db.end();
});

test("lazy expiry cancels the old order and reserves for the next buyer", async () => {
  const db = await client();
  const setup = await parties(db);
  const buyer2 = randomUUID();
  await seedUser(db, buyer2);
  const old = await createOrder(db, setup.buyerId, setup.listingId);
  await asOwner(db);
  await db.query("update public.orders set checkout_expires_at=now()-interval '1 minute' where id=$1", [old.id]);
  const next = await createOrder(db, buyer2, setup.listingId);
  assert.equal(next.buyer_id, buyer2);
  await asOwner(db);
  assert.equal((await db.query("select status from public.orders where id=$1", [old.id])).rows[0].status, "cancelled");
  await db.end();
});

test("refund totals cannot exceed the order total", async () => {
  const db = await client();
  const setup = await parties(db, { priceCents: 1000 });
  const order = await paid(db, setup);
  const partial = await transition(db, order.id, "refunded", null, "admin", { amount_cents: 700 });
  assert.equal(partial.refunded_cents, 700);
  await assert.rejects(() => transition(db, order.id, "refunded", null, "admin", { amount_cents: 400 }), { code: "22023" });
  await asOwner(db);
  assert.equal((await db.query("select refunded_cents from public.orders where id=$1", [order.id])).rows[0].refunded_cents, 700);
  await db.end();
});

test("audit log rejects mutation and truncation for service role and owner", async () => {
  const db = await client();
  const setup = await parties(db);
  await createOrder(db, setup.buyerId, setup.listingId);
  for (const mode of [asService, asOwner]) {
    await mode(db);
    await assert.rejects(() => db.query("update public.marketplace_audit_log set action='x'"), { code: "55000" });
    await assert.rejects(() => db.query("delete from public.marketplace_audit_log"), { code: "55000" });
    await assert.rejects(() => db.query("truncate public.marketplace_audit_log"), { code: "55000" });
  }
  await db.end();
});

test("full order path transfers the copy and enforces tracking and completion delay", async () => {
  const db = await client();
  const setup = await parties(db, { priceCents: 5000 });
  const order = await paid(db, setup);
  await assert.rejects(() => transition(db, order.id, "shipped", setup.sellerId, "seller"), { code: "22023" });
  const shipped = await transition(db, order.id, "shipped", setup.sellerId, "seller", { tracking_number: "1Z 999 AA", tracking_carrier: "ups" });
  const delivered = await transition(db, shipped.id, "delivered", setup.buyerId, "buyer");
  await asOwner(db);
  assert.equal((await db.query("select count(*)::int n from public.user_collections where id=$1", [setup.collectionId])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from public.user_collections where user_id=$1 and status='owned'", [setup.buyerId])).rows[0].n, 1);
  await db.query("update public.orders set delivered_at=now()-interval '4 days' where id=$1", [delivered.id]);
  const completed = await transition(db, delivered.id, "completed", null, "system");
  assert.equal(completed.status, "completed");
  await db.end();
});

test("system auto-delivery waits fourteen days", async () => {
  const db = await client();
  const setup = await parties(db, { priceCents: 6000 });
  const order = await paid(db, setup);
  const shipped = await transition(db, order.id, "shipped", setup.sellerId, "seller", { tracking_number: "12345678", tracking_carrier: "usps" });
  await assert.rejects(() => transition(db, shipped.id, "delivered", null, "system"), { code: "22023" });
  await asOwner(db);
  await db.query("update public.orders set shipped_at=now()-interval '15 days' where id=$1", [shipped.id]);
  assert.equal((await transition(db, shipped.id, "delivered", null, "system")).delivered_by, "system");
  await db.end();
});

test("a paid order's sale is invisible to the off-platform purchase flow", async () => {
  const db = await client();
  const setup = await parties(db);
  const order = await paid(db, setup);
  await asOwner(db);
  const sale = (await db.query("select status, order_id from public.sold_items where id=$1", [order.sold_item_id])).rows[0];
  assert.equal(sale.status, "order_pending");
  assert.equal(sale.order_id, order.id);
  // inbox prompts and scripts/expirePendingSales.js only touch pending_buyer
  assert.equal((await db.query("select count(*)::int n from public.sold_items where buyer_id=$1 and status='pending_buyer'", [setup.buyerId])).rows[0].n, 0);
  // /api/purchases/[id]/confirm calls confirm_sale_transfer directly
  await asService(db);
  await assert.rejects(() => db.query("select public.confirm_sale_transfer($1,$2)", [order.sold_item_id, setup.buyerId]), { code: "22023" });
  await assert.rejects(
    () => db.query("select public.mark_item_sold($1,$2,10,'comixcatalog_order',$3,$4)", [setup.sellerId, randomUUID(), setup.buyerId, order.id]),
    { code: "42501" },
  );
  await db.end();
});

test("a block made after checkout does not strand the payment", async () => {
  const db = await client();
  const setup = await parties(db);
  const order = await awaiting(db, setup);
  await asOwner(db);
  await db.query("insert into public.user_blocks (blocker_id, blocked_id) values ($1,$2)", [setup.sellerId, setup.buyerId]);
  const result = await transition(db, order.id, "paid", null, "stripe", payment(order), null, `evt_${randomUUID()}`);
  assert.equal(result.status, "paid");
  await db.end();
});

test("seller refund before shipping returns the copy to the seller, never the buyer", async () => {
  const db = await client();
  const setup = await parties(db, { priceCents: 2500 });
  const order = await paid(db, setup);
  const refunded = await transition(db, order.id, "refunded", setup.sellerId, "seller", { amount_cents: order.total_cents });
  assert.equal(refunded.status, "refunded");
  await asOwner(db);
  assert.equal((await db.query("select status from public.sold_items where id=$1", [order.sold_item_id])).rows[0].status, "refunded");
  assert.equal((await db.query("select count(*)::int n from public.user_collections where user_id=$1 and status='owned'", [setup.sellerId])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.user_collections where user_id=$1", [setup.buyerId])).rows[0].n, 0);
  await asService(db);
  await assert.rejects(() => db.query("select public.confirm_sale_transfer($1,$2)", [order.sold_item_id, setup.buyerId]), { code: "22023" });
  await db.end();
});

test("admin full refund after shipping marks the sale refunded without restoring the copy", async () => {
  const db = await client();
  const setup = await parties(db, { priceCents: 2500 });
  const order = await paid(db, setup);
  await transition(db, order.id, "shipped", setup.sellerId, "seller");
  await transition(db, order.id, "refunded", null, "admin", { amount_cents: order.total_cents });
  await asOwner(db);
  assert.equal((await db.query("select status from public.sold_items where id=$1", [order.sold_item_id])).rows[0].status, "refunded");
  assert.equal((await db.query("select count(*)::int n from public.user_collections where user_id=$1", [setup.sellerId])).rows[0].n, 0);
  await db.end();
});
