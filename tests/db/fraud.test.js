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

async function setup(db, { confirmed = true, ageDays = 30, priceCents = 5000 } = {}) {
  const sellerId = randomUUID();
  const buyerId = randomUUID();
  await seedUser(db, sellerId);
  await seedUser(db, buyerId, { confirmed });
  await asOwner(db);
  await db.query("update auth.users set created_at=now()-make_interval(days=>$2) where id=$1", [buyerId, ageDays]);
  const listing = await seedListing(db, { sellerId, priceCents });
  if (priceCents >= 10000) {
    // $100+ needs front and back photos (0068), or the photo rule fires before the buyer limits.
    await asOwner(db);
    for (const kind of ["front", "back"]) {
      await db.query(
        "insert into public.listing_photos(listing_id,collection_id,owner_id,storage_path,thumb_path,kind) values($1,$2,$3,$4,$4,$5)",
        [listing.listingId, listing.collectionId, sellerId, `${kind}-${randomUUID()}`, kind],
      );
    }
  }
  return { sellerId, buyerId, ...listing };
}

async function cancel(db, order, buyerId) {
  return transition(db, order.id, "cancelled", buyerId, "buyer");
}

test("unverified email and first-week amount cap fail before an order is inserted", async () => {
  const db = await client();
  const unverified = await setup(db, { confirmed: false });
  await assert.rejects(() => createOrder(db, unverified.buyerId, unverified.listingId), { code: "54000" });
  const young = await setup(db, { ageDays: 2, priceCents: 25001 });
  await assert.rejects(() => createOrder(db, young.buyerId, young.listingId), { code: "54000" });
  const old = await setup(db, { ageDays: 8, priceCents: 25001 });
  assert.equal((await createOrder(db, old.buyerId, old.listingId)).total_cents, 25001);
  await db.end();
});

test("third open checkout is blocked and parallel attempts serialize", async () => {
  const db = await client();
  const setupData = await setup(db);
  const second = await seedListing(db, { sellerId: setupData.sellerId, issue: 2 });
  const third = await seedListing(db, { sellerId: setupData.sellerId, issue: 3 });
  await createOrder(db, setupData.buyerId, setupData.listingId);
  const secondOrder = await createOrder(db, setupData.buyerId, second.listingId);
  await assert.rejects(() => createOrder(db, setupData.buyerId, third.listingId), { code: "54000" });
  await cancel(db, secondOrder, setupData.buyerId);
  const fourth = await seedListing(db, { sellerId: setupData.sellerId, issue: 4 });
  const fifth = await seedListing(db, { sellerId: setupData.sellerId, issue: 5 });
  await db.end();
  const results = await Promise.all([fourth.listingId, fifth.listingId].map(async (listingId) => {
    const parallel = await client();
    try {
      await createOrder(parallel, setupData.buyerId, listingId, randomUUID());
      return "ok";
    } catch (error) {
      return error.code;
    } finally {
      await parallel.end();
    }
  }));
  assert.equal(results.filter((result) => result === "ok").length, 1);
  assert.equal(results.filter((result) => result === "54000").length, 1);
});

test("three abandoned checkouts start a cooldown which lifts after the window", async () => {
  const db = await client();
  const setupData = await setup(db);
  for (let issue = 10; issue < 13; issue++) {
    const listing = issue === 10 ? setupData : await seedListing(db, { sellerId: setupData.sellerId, issue });
    const order = await createOrder(db, setupData.buyerId, listing.listingId);
    await cancel(db, order, setupData.buyerId);
  }
  const blocked = await seedListing(db, { sellerId: setupData.sellerId, issue: 13 });
  await assert.rejects(() => createOrder(db, setupData.buyerId, blocked.listingId), { code: "54000" });
  await asOwner(db);
  await db.query("update orders set cancelled_at=now()-interval '25 hours' where buyer_id=$1", [setupData.buyerId]);
  assert.equal((await createOrder(db, setupData.buyerId, blocked.listingId)).buyer_id, setupData.buyerId);
  await db.end();
});

test("shared card and off-platform message flags are private and appear in admin search", async () => {
  const db = await client();
  const first = await setup(db);
  const sellerAsBuyerListing = await seedListing(db, { sellerId: first.buyerId, issue: 20 });
  const prior = await createOrder(db, first.sellerId, sellerAsBuyerListing.listingId);
  await asOwner(db);
  await db.query("update orders set card_fingerprint='fp_shared' where id=$1", [prior.id]);
  const current = await createOrder(db, first.buyerId, first.listingId);
  await asOwner(db);
  await db.query("update orders set card_fingerprint='fp_shared' where id=$1", [current.id]);
  await asService(db);
  assert.equal((await db.query("select public.mkt_flag_shared_card($1) flagged", [current.id])).rows[0].flagged, true);
  const message = await db.query("insert into messages(sender_id,recipient_id,order_id,body) values($1,$2,$3,'Pay by Zelle') returning id", [first.buyerId, first.sellerId, current.id]);
  await db.query("insert into message_flags(message_id,kind,terms) values($1,'offplatform_payment',array['Zelle'])", [message.rows[0].id]);
  await db.query("insert into order_flags(order_id,kind) values($1,'offplatform_terms')", [current.id]);
  const search = await db.query("select flags from public.admin_order_search(null,null,50,null) where id=$1", [current.id]);
  assert.deepEqual(search.rows[0].flags, ["offplatform_terms", "shared_card"]);
  await asUser(db, first.buyerId);
  await assert.rejects(() => db.query("select * from message_flags"), { code: "42501" });
  await assert.rejects(() => db.query("select * from order_flags"), { code: "42501" });
  await db.end();
});

// Orders that are neither open nor abandoned, so only the daily limit can apply.
async function settledOrders(db, buyerId, count) {
  for (let index = 0; index < count; index++) {
    const sellerId = randomUUID();
    await seedUser(db, sellerId);
    const { listingId } = await seedListing(db, { sellerId, priceCents: 2000, issue: 1000 + index });
    const order = await createOrder(db, buyerId, listingId);
    await asOwner(db);
    await db.query("update public.orders set status = 'paid', paid_at = now() where id = $1", [order.id]);
  }
}

test("daily checkout limit is 3 for a first-week account and 10 after", async () => {
  const db = await client();
  const young = await setup(db, { ageDays: 2, priceCents: 2000 });
  await settledOrders(db, young.buyerId, 3);
  await assert.rejects(
    () => createOrder(db, young.buyerId, young.listingId),
    (error) => error.code === "54000" && /daily_limit/.test(error.message),
  );
  const old = await setup(db, { ageDays: 30, priceCents: 2000 });
  await settledOrders(db, old.buyerId, 3);
  assert.equal((await createOrder(db, old.buyerId, old.listingId)).buyer_id, old.buyerId);
  await asOwner(db);
  await db.query("update public.orders set status = 'paid', paid_at = now() where buyer_id = $1 and status = 'created'", [old.buyerId]);
  await settledOrders(db, old.buyerId, 6);
  const tenth = await setup(db, { ageDays: 30, priceCents: 2000 });
  await assert.rejects(
    () => createOrder(db, old.buyerId, tenth.listingId),
    (error) => error.code === "54000" && /daily_limit/.test(error.message),
  );
  await db.end();
});

test("a card the seller never used does not raise the shared-card flag", async () => {
  const db = await client();
  const first = await setup(db);
  const sellerAsBuyerListing = await seedListing(db, { sellerId: first.buyerId, issue: 21 });
  const prior = await createOrder(db, first.sellerId, sellerAsBuyerListing.listingId);
  await asOwner(db);
  await db.query("update orders set card_fingerprint = 'fp_seller_own' where id = $1", [prior.id]);
  const current = await createOrder(db, first.buyerId, first.listingId);
  await asOwner(db);
  await db.query("update orders set card_fingerprint = 'fp_buyer_own' where id = $1", [current.id]);
  await asService(db);
  assert.equal((await db.query("select public.mkt_flag_shared_card($1) flagged", [current.id])).rows[0].flagged, false);
  await asOwner(db);
  assert.equal((await db.query("select count(*)::int n from order_flags where order_id = $1", [current.id])).rows[0].n, 0);
  await db.end();
});
