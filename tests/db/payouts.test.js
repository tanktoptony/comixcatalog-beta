import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  startDatabase,
  stopDatabase,
  newClient,
  asOwner,
  asService,
  seedUser,
  seedListing,
  createOrder,
  transition,
} from "./harness.js";

const seller = "00000000-0000-4000-8000-000000000071";
const buyer = "00000000-0000-4000-8000-000000000072";

before(async () => startDatabase());
after(async () => stopDatabase());

async function client() {
  const db = newClient();
  await db.connect();
  return db;
}

async function paidAndShipped(db, { sellerId, buyerId, listingId, suffix }) {
  let order = await createOrder(db, buyerId, listingId);
  order = await transition(db, order.id, "awaiting_payment", null, "system", {
    stripe_checkout_session_id: `cs_${suffix}`,
  });
  order = await transition(db, order.id, "paid", null, "stripe", {
    stripe_checkout_session_id: `cs_${suffix}`,
    amount_total: order.total_cents,
    currency: "usd",
    livemode: false,
    stripe_payment_intent_id: `pi_${suffix}`,
    stripe_charge_id: `ch_${suffix}`,
    ship_to: { name: "Buyer" },
  });
  return transition(db, order.id, "shipped", sellerId, "seller", {
    tracking_number: "12345678",
    tracking_carrier: "usps",
  });
}

test("Stripe event claims deduplicate, retry failures, and reclaim stale work", async () => {
  const a = await client();
  const b = await client();
  await asService(a);
  await asService(b);
  const values = ["evt_concurrent", "checkout.session.completed", false, null];
  const claims = await Promise.all([
    a.query("select public.mkt_claim_stripe_event($1,$2,$3,$4) value", values),
    b.query("select public.mkt_claim_stripe_event($1,$2,$3,$4) value", values),
  ]);
  assert.deepEqual(claims.map((result) => result.rows[0].value).sort(), ["done", "process"]);

  await a.query("select public.mkt_finish_stripe_event($1,$2)", ["evt_concurrent", "failed"]);
  assert.equal(
    (await a.query("select public.mkt_claim_stripe_event($1,$2,$3,$4) value", values)).rows[0].value,
    "process",
  );
  await a.query("select public.mkt_finish_stripe_event($1,null)", ["evt_concurrent"]);
  assert.equal(
    (await a.query("select public.mkt_claim_stripe_event($1,$2,$3,$4) value", values)).rows[0].value,
    "done",
  );

  const stale = ["evt_stale", "checkout.session.completed", false, null];
  assert.equal((await a.query("select public.mkt_claim_stripe_event($1,$2,$3,$4) value", stale)).rows[0].value, "process");
  assert.equal((await a.query("select public.mkt_claim_stripe_event($1,$2,$3,$4) value", stale)).rows[0].value, "done");
  await asOwner(a);
  await a.query("update public.stripe_events set claimed_at=now()-interval '3 minutes' where id=$1", [stale[0]]);
  await asService(a);
  assert.equal((await a.query("select public.mkt_claim_stripe_event($1,$2,$3,$4) value", stale)).rows[0].value, "process");
  await a.end();
  await b.end();
});

test("payout holds and transfer recording enforce eligibility", async () => {
  const db = await client();
  await seedUser(db, seller);
  await seedUser(db, buyer);
  const { listingId } = await seedListing(db, { sellerId: seller, tier: "established" });
  const order = await createOrder(db, buyer, listingId);
  await asOwner(db);
  await db.query(
    "update public.orders set status='completed',paid_at=now()-interval '20 days',completed_at=now(),stripe_charge_id='ch_due' where id=$1",
    [order.id],
  );
  await asService(db);
  let due = await db.query("select id from public.mkt_payout_due()");
  assert.deepEqual(due.rows.map((row) => row.id), [order.id]);
  await asOwner(db);
  await db.query("update public.seller_accounts set tier='new' where user_id=$1", [seller]);
  await db.query("update public.orders set paid_at=now()-interval '1 day' where id=$1", [order.id]);
  await asService(db);
  assert.equal((await db.query("select id from public.mkt_payout_due()")).rowCount, 0);
  await asOwner(db);
  await db.query("update public.orders set paid_at=now()-interval '15 days' where id=$1", [order.id]);
  await db.query("update public.seller_accounts set bank_changed_at=now() where user_id=$1", [seller]);
  await asService(db);
  assert.equal((await db.query("select id from public.mkt_payout_due()")).rowCount, 0);
  await asOwner(db);
  await db.query("update public.seller_accounts set bank_changed_at=now()-interval '8 days' where user_id=$1", [seller]);
  await asService(db);
  assert.equal((await db.query("select id from public.mkt_payout_due()")).rowCount, 1);
  for (const [block, restore] of [
    ["payouts_frozen=true", "payouts_frozen=false"],
    ["tier='suspended'", "tier='new'"],
    ["payouts_enabled=false", "payouts_enabled=true"],
  ]) {
    await asOwner(db);
    await db.query(`update public.seller_accounts set ${block} where user_id=$1`, [seller]);
    await asService(db);
    assert.equal((await db.query("select id from public.mkt_payout_due()")).rowCount, 0, block);
    await asOwner(db);
    await db.query(`update public.seller_accounts set ${restore} where user_id=$1`, [seller]);
  }
  await asService(db);
  assert.equal((await db.query("select id from public.mkt_payout_due()")).rowCount, 1);
  await db.query("select public.order_mark_transferred($1,$2)", [order.id, "tr_one"]);
  assert.equal((await db.query("select id from public.mkt_payout_due()")).rowCount, 0, "already transferred");
  await db.query("select public.order_mark_transferred($1,$2)", [order.id, "tr_one"]);
  await assert.rejects(
    db.query("select public.order_mark_transferred($1,$2)", [order.id, "tr_two"]),
    (error) => error.code === "55000",
  );
  await db.end();
});

test("database sweep counts failures, continues, completes, and redacts", async () => {
  const db = await client();
  const goodSeller = "00000000-0000-4000-8000-000000000073";
  const goodBuyer = "00000000-0000-4000-8000-000000000074";
  const badSeller = "00000000-0000-4000-8000-000000000075";
  const badBuyer = "00000000-0000-4000-8000-000000000076";
  for (const id of [goodSeller, goodBuyer, badSeller, badBuyer]) await seedUser(db, id);
  const goodListing = await seedListing(db, { sellerId: goodSeller, tier: "established", issue: 701 });
  const badListing = await seedListing(db, { sellerId: badSeller, tier: "established", issue: 702 });
  const good = await paidAndShipped(db, {
    sellerId: goodSeller,
    buyerId: goodBuyer,
    listingId: goodListing.listingId,
    suffix: "sweep_good",
  });
  const bad = await paidAndShipped(db, {
    sellerId: badSeller,
    buyerId: badBuyer,
    listingId: badListing.listingId,
    suffix: "sweep_bad",
  });
  await asOwner(db);
  await db.query("update public.orders set shipped_at=now()-interval '15 days' where id in ($1,$2)", [good.id, bad.id]);
  await db.query("update public.sold_items set status='confirmed' where id=$1", [bad.sold_item_id]);
  await asService(db);
  let result = (await db.query("select public.order_sweep_db() value")).rows[0].value;
  assert.equal(result.delivered, 1);
  assert.equal(result.errors, 1);
  await asOwner(db);
  await db.query("update public.orders set delivered_at=now()-interval '4 days' where id=$1", [good.id]);
  await asService(db);
  result = (await db.query("select public.order_sweep_db() value")).rows[0].value;
  assert.equal(result.completed, 1);
  assert.equal(result.errors, 1);
  await asOwner(db);
  await db.query("update public.orders set completed_at=now()-interval '121 days' where id=$1", [good.id]);
  await asService(db);
  result = (await db.query("select public.order_sweep_db() value")).rows[0].value;
  assert.equal(result.redacted, 1);
  assert.equal((await db.query("select ship_to from public.orders where id=$1", [good.id])).rows[0].ship_to, null);
  await db.end();
});
