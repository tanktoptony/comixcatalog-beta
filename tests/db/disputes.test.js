import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  asOwner,
  asService,
  asUser,
  createOrder,
  newClient,
  seedListing,
  seedUser,
  startDatabase,
  stopDatabase,
  transition,
} from "./harness.js";

before(async () => startDatabase());
after(async () => stopDatabase());

async function client() {
  const db = newClient();
  await db.connect();
  return db;
}

async function paidOrder(db, issue = Math.floor(Math.random() * 1000000)) {
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  await seedUser(db, sellerId);
  await seedUser(db, buyerId);
  const { listingId } = await seedListing(db, { sellerId, priceCents: 1000, issue });
  const created = await createOrder(db, buyerId, listingId, randomUUID());
  const awaiting = await transition(db, created.id, "awaiting_payment", null, "system", {
    stripe_checkout_session_id: `cs_${created.id}`,
  });
  const paid = await transition(db, created.id, "paid", null, "stripe", {
    stripe_checkout_session_id: awaiting.stripe_checkout_session_id,
    amount_total: awaiting.total_cents,
    currency: "usd",
    livemode: false,
    stripe_payment_intent_id: `pi_${created.id}`,
    stripe_charge_id: `ch_${created.id}`,
    ship_to: {},
  });
  return { order: paid, sellerId, buyerId };
}

async function shippedOrder(db) {
  const setup = await paidOrder(db);
  setup.order = await transition(db, setup.order.id, "shipped", setup.sellerId, "seller", {
    carrier: "USPS",
    tracking_number: `track_${setup.order.id}`,
  });
  return setup;
}

async function openDispute(db, setup, kind = "not_received") {
  await asService(db);
  return (await db.query(
    "select * from public.order_open_dispute($1,$2,$3,$4)",
    [setup.order.id, setup.buyerId, kind, "The package has not arrived yet."],
  )).rows[0];
}

test("failure modes reject early, late, non-buyer, and second disputes", async () => {
  const db = await client();
  const paid = await paidOrder(db);
  await assert.rejects(() => openDispute(db, paid), { code: "55000" });
  const shipped = await shippedOrder(db);
  await asService(db);
  await assert.rejects(
    () => db.query("select public.order_open_dispute($1,$2,$3,$4)", [shipped.order.id, paid.buyerId, "not_received", "This package never arrived."]),
    { code: "42501" },
  );
  await openDispute(db, shipped);
  await assert.rejects(() => openDispute(db, shipped, "not_as_described"), { code: "55000" });
  const completed = await shippedOrder(db);
  const delivered = await transition(db, completed.order.id, "delivered", completed.buyerId, "buyer", {});
  await asOwner(db);
  await db.query("update public.orders set delivered_at=now()-interval '4 days' where id=$1", [delivered.id]);
  completed.order = await transition(db, delivered.id, "completed", null, "system", {});
  await assert.rejects(() => openDispute(db, completed), { code: "55000" });
  await db.end();
});

test("chargeback supersedes an open buyer dispute and closes idempotently", async () => {
  const db = await client();
  const setup = await shippedOrder(db);
  const buyerDispute = await openDispute(db, setup);
  await asService(db);
  await db.query("select public.order_record_chargeback($1,$2,$3)", [setup.order.id, "dp_supersede", "evt_created"]);
  await asOwner(db);
  const rows = (await db.query("select * from public.order_disputes where order_id=$1 order by opened_at", [setup.order.id])).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.id === buyerDispute.id).status, "withdrawn");
  assert.equal(rows.find((row) => row.id === buyerDispute.id).resolution_note, "Superseded by a card chargeback");
  assert.equal(rows.find((row) => row.kind === "chargeback").status, "open");
  await asService(db);
  await db.query("select public.order_close_chargeback($1,false,$2)", ["dp_supersede", "evt_closed"]);
  await db.query("select public.order_close_chargeback($1,false,$2)", ["dp_supersede", "evt_closed"]);
  const order = (await db.query("select * from public.orders where id=$1", [setup.order.id])).rows[0];
  assert.equal(order.refunded_cents, order.total_cents);
  assert.equal((await db.query("select count(*)::int n from public.marketplace_audit_log where stripe_event_id='evt_closed'", [])).rows[0].n, 2);
  await db.end();
});

test("withdraw restores shipped status and parties alone can read records", async () => {
  const db = await client();
  const setup = await shippedOrder(db);
  await openDispute(db, setup, "not_as_described");
  const adminId = randomUUID();
  const strangerId = randomUUID();
  await seedUser(db, adminId);
  await seedUser(db, strangerId);
  await asService(db);
  await db.query("select public.order_resolve_dispute($1,$2,'withdrawn','Buyer withdrew the claim',null)", [adminId, setup.order.id]);
  assert.equal((await db.query("select status from public.orders where id=$1", [setup.order.id])).rows[0].status, "shipped");
  await db.query("select public.order_record_refund($1,100,'Courtesy refund',$2,'admin','re_rls',null)", [setup.order.id, adminId]);
  await asUser(db, setup.buyerId);
  assert.equal((await db.query("select order_id,status from public.order_disputes where order_id=$1", [setup.order.id])).rowCount, 1);
  assert.equal((await db.query("select order_id,amount_cents,reason,status,created_at from public.order_refunds where order_id=$1", [setup.order.id])).rowCount, 1);
  await asUser(db, strangerId);
  assert.equal((await db.query("select order_id,status from public.order_disputes where order_id=$1", [setup.order.id])).rowCount, 0);
  assert.equal((await db.query("select order_id,amount_cents,reason,status,created_at from public.order_refunds where order_id=$1", [setup.order.id])).rowCount, 0);
  await db.end();
});

test("refund identifiers are idempotent and concurrent refunds cannot exceed total", async () => {
  const setupDb = await client();
  const setup = await paidOrder(setupDb);
  await setupDb.end();
  const refund = async (id, amount) => {
    const db = await client();
    try {
      await asService(db);
      await db.query("select public.order_record_refund($1,$2,'Admin refund',null,'admin',$3,null)", [setup.order.id, amount, id]);
      return "ok";
    } catch (error) {
      return error.code;
    } finally {
      await db.end();
    }
  };
  assert.equal(await refund("re_once", 100), "ok");
  assert.equal(await refund("re_once", 100), "ok");
  const results = await Promise.all([refund("re_a", 900), refund("re_b", 900)]);
  assert.equal(results.filter((value) => value === "ok").length, 1);
  const check = await client();
  await asOwner(check);
  assert.equal((await check.query("select refunded_cents from public.orders where id=$1", [setup.order.id])).rows[0].refunded_cents, 1000);
  assert.equal((await check.query("select count(*)::int n from public.order_refunds where order_id=$1", [setup.order.id])).rows[0].n, 2);
  await check.end();
});

// One seller, many orders: for payout and standing rules that look across a seller's orders.
async function sellerOrder(db, sellerId, tier = "established") {
  const buyerId = randomUUID();
  await seedUser(db, buyerId);
  const { listingId } = await seedListing(db, { sellerId, priceCents: 1000, issue: Math.floor(Math.random() * 1000000), tier });
  const created = await createOrder(db, buyerId, listingId, randomUUID());
  const awaiting = await transition(db, created.id, "awaiting_payment", null, "system", { stripe_checkout_session_id: `cs_${created.id}` });
  await transition(db, created.id, "paid", null, "stripe", {
    stripe_checkout_session_id: awaiting.stripe_checkout_session_id,
    amount_total: awaiting.total_cents,
    currency: "usd",
    livemode: false,
    stripe_payment_intent_id: `pi_${created.id}`,
    stripe_charge_id: `ch_${created.id}`,
    ship_to: {},
  });
  const shipped = await transition(db, created.id, "shipped", sellerId, "seller", { tracking_number: `track${created.id.slice(0, 8)}`, tracking_carrier: "usps" });
  return { order: shipped, sellerId, buyerId };
}

async function dueIds(db) {
  await asService(db);
  return (await db.query("select id from public.mkt_payout_due()")).rows.map((row) => row.id);
}

test("an open dispute row holds the payout even when the order reads completed", async () => {
  const db = await client();
  const sellerId = randomUUID();
  await seedUser(db, sellerId);
  const setup = await sellerOrder(db, sellerId);
  await transition(db, setup.order.id, "delivered", setup.buyerId, "buyer");
  await asOwner(db);
  await db.query("update public.orders set delivered_at = now() - interval '4 days' where id = $1", [setup.order.id]);
  await transition(db, setup.order.id, "completed", null, "system");
  assert.ok((await dueIds(db)).includes(setup.order.id), "completed order is due");
  await asOwner(db);
  await db.query(
    "insert into public.order_disputes (order_id, kind, stripe_dispute_id, reason_text) values ($1, 'chargeback', 'dp_hold', 'Stripe chargeback')",
    [setup.order.id],
  );
  assert.ok(!(await dueIds(db)).includes(setup.order.id), "open dispute holds the payout");
  await asOwner(db);
  await db.query("update public.order_disputes set status = 'resolved_seller', resolved_at = now() where stripe_dispute_id = 'dp_hold'");
  assert.ok((await dueIds(db)).includes(setup.order.id), "resolved dispute releases it");
  await db.end();
});

test("a buyer win needs a Stripe refund id and never double-counts the refund", async () => {
  const db = await client();
  const adminId = randomUUID();
  await seedUser(db, adminId);
  const setup = await shippedOrder(db);
  await openDispute(db, setup);
  await asService(db);
  await assert.rejects(
    () => db.query("select public.order_resolve_dispute($1,$2,'buyer','Refunding part',300,null)", [adminId, setup.order.id]),
    { code: "22023" },
  );
  // What the admin route does: refund in Stripe and record it, then resolve with the same refund id.
  await db.query("select public.order_record_refund($1,300,'Refunding part',$2,'admin','re_partial',null)", [setup.order.id, adminId]);
  await db.query("select public.order_resolve_dispute($1,$2,'buyer','Refunding part',300,'re_partial')", [adminId, setup.order.id]);
  await asOwner(db);
  const order = (await db.query("select status, refunded_cents from public.orders where id = $1", [setup.order.id])).rows[0];
  assert.equal(order.refunded_cents, 300);
  assert.equal(order.status, "completed");
  assert.equal((await db.query("select status from public.order_disputes where order_id = $1", [setup.order.id])).rows[0].status, "resolved_buyer");
  assert.equal((await db.query("select count(*)::int n from public.order_refunds where order_id = $1", [setup.order.id])).rows[0].n, 1);
  await db.end();
});

test("a seller win completes the order and closes the dispute", async () => {
  const db = await client();
  const adminId = randomUUID();
  await seedUser(db, adminId);
  const setup = await shippedOrder(db);
  await openDispute(db, setup);
  await asService(db);
  await db.query("select public.order_resolve_dispute($1,$2,'seller','Tracking shows delivered',null,null)", [adminId, setup.order.id]);
  await asOwner(db);
  assert.equal((await db.query("select status from public.orders where id = $1", [setup.order.id])).rows[0].status, "completed");
  assert.equal((await db.query("select status from public.order_disputes where order_id = $1", [setup.order.id])).rows[0].status, "resolved_seller");
  await db.end();
});

test("two disputes lost in 90 days limit the seller, with an audit row", async () => {
  const db = await client();
  const sellerId = randomUUID();
  await seedUser(db, sellerId);
  for (const [index, id] of ["dp_lost_1", "dp_lost_2"].entries()) {
    const setup = await sellerOrder(db, sellerId);
    await asService(db);
    await db.query("select public.order_record_chargeback($1,$2,$3)", [setup.order.id, id, `evt_open_${index}`]);
    await db.query("select public.order_close_chargeback($1,false,$2)", [id, `evt_lost_${index}`]);
    await asOwner(db);
    const tier = (await db.query("select tier from public.seller_accounts where user_id = $1", [sellerId])).rows[0].tier;
    assert.equal(tier, index === 0 ? "established" : "limited");
  }
  assert.equal(
    (await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id = $1 and action = 'tier_limited_disputes'", [sellerId])).rows[0].n,
    1,
  );
  await db.end();
});
