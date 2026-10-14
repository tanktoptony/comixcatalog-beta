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
  const db = newClient();
  await db.connect();
  return db;
}

async function completedOrder(db, { total = 1000, sellerId = randomUUID(), buyerId = randomUUID(), issue = Math.floor(Math.random() * 1000000) } = {}) {
  await seedUser(db, sellerId);
  await seedUser(db, buyerId);
  const listing = await seedListing(db, { sellerId, priceCents: total, issue });
  const created = await createOrder(db, buyerId, listing.listingId);
  const awaiting = await transition(db, created.id, "awaiting_payment", null, "system", { stripe_checkout_session_id: `cs_${created.id}` });
  const paid = await transition(db, created.id, "paid", null, "stripe", {
    stripe_checkout_session_id: awaiting.stripe_checkout_session_id,
    amount_total: awaiting.total_cents,
    currency: "usd",
    livemode: false,
    stripe_payment_intent_id: `pi_${created.id}`,
    stripe_charge_id: `ch_${created.id}`,
    ship_to: {},
  });
  const shipped = await transition(db, paid.id, "shipped", sellerId, "seller", {});
  const delivered = await transition(db, shipped.id, "delivered", buyerId, "buyer", {});
  await asOwner(db);
  await db.query("update public.orders set delivered_at=now()-interval '4 days' where id=$1", [created.id]);
  const complete = await transition(db, delivered.id, "completed", null, "system", {});
  return { order: complete, sellerId, buyerId };
}

async function leave(db, orderId, authorId, rating = 1, comment = "Good trade") {
  await asService(db);
  return (await db.query("select * from public.order_leave_feedback($1,$2,$3,$4)", [orderId, authorId, rating, comment])).rows[0];
}

test("feedback rejects non-parties, early and late ratings, and duplicates", async () => {
  const db = await client();
  const setup = await completedOrder(db);
  const stranger = randomUUID();
  await seedUser(db, stranger);
  await assert.rejects(() => leave(db, setup.order.id, stranger), { code: "42501" });
  await asOwner(db);
  await db.query("update public.orders set status='delivered' where id=$1", [setup.order.id]);
  await assert.rejects(() => leave(db, setup.order.id, setup.buyerId), { code: "55000" });
  await asOwner(db);
  await db.query("update public.orders set status='completed',completed_at=now()-interval '61 days' where id=$1", [setup.order.id]);
  await assert.rejects(() => leave(db, setup.order.id, setup.buyerId), { code: "55000" });
  await asOwner(db);
  await db.query("update public.orders set completed_at=now() where id=$1", [setup.order.id]);
  await leave(db, setup.order.id, setup.buyerId);
  await assert.rejects(() => leave(db, setup.order.id, setup.buyerId), { code: "23505" });
  await db.end();
});

test("feedback is double-blind and becomes visible together", async () => {
  const db = await client();
  const setup = await completedOrder(db);
  await leave(db, setup.order.id, setup.buyerId);
  await asUser(db, setup.sellerId);
  assert.equal((await db.query("select order_id from public.order_feedback where order_id=$1", [setup.order.id])).rowCount, 0);
  await leave(db, setup.order.id, setup.sellerId, 0, "Okay");
  await asUser(db, setup.sellerId);
  assert.equal((await db.query("select order_id from public.order_feedback where order_id=$1", [setup.order.id])).rowCount, 2);
  const alone = await completedOrder(db);
  await leave(db, alone.order.id, alone.buyerId);
  await asOwner(db);
  await db.query("update public.order_feedback set visible_at=now()-interval '1 second' where order_id=$1", [alone.order.id]);
  await asUser(db, alone.sellerId);
  assert.equal((await db.query("select order_id from public.order_feedback where order_id=$1", [alone.order.id])).rowCount, 1);
  await db.end();
});

test("anon rating functions work while hidden rows and writes stay protected", async () => {
  const db = await client();
  const setup = await completedOrder(db);
  await leave(db, setup.order.id, setup.buyerId);
  await asOwner(db);
  await db.query("set role anon");
  await db.query("select set_config('request.jwt.claims','{\"role\":\"anon\"}',false)");
  assert.equal((await db.query("select order_id,author_id,subject_id,author_role,rating,comment,created_at from public.order_feedback where order_id=$1", [setup.order.id])).rowCount, 0);
  assert.equal((await db.query("select public.mkt_seller_rating($1) rating", [setup.sellerId])).rows[0].rating.count, 0);
  assert.equal((await db.query("select * from public.mkt_seller_ratings($1)", [[setup.sellerId]])).rowCount, 1);
  await assert.rejects(() => db.query("select public.order_leave_feedback($1,$2,1,'x')", [setup.order.id, setup.sellerId]), { code: "42501" });
  await db.end();
});

test("admin removal validates its reason and writes an audit row", async () => {
  const db = await client();
  const setup = await completedOrder(db);
  await leave(db, setup.order.id, setup.buyerId);
  const admin = randomUUID();
  await seedUser(db, admin);
  await asService(db);
  await assert.rejects(() => db.query("select public.admin_remove_feedback($1,$2,$3,'no')", [admin, setup.order.id, setup.buyerId]), { code: "22023" });
  await db.query("select public.admin_remove_feedback($1,$2,$3,'Policy violation')", [admin, setup.order.id, setup.buyerId]);
  await asOwner(db);
  assert.equal((await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1 and action='feedback_removed'", [setup.order.id])).rows[0].n, 1);
  await db.end();
});
