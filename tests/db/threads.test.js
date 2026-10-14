import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  asOwner, asService, createOrder, newClient, seedListing, seedUser, startDatabase, stopDatabase,
} from "./harness.js";

before(async () => startDatabase());
after(async () => stopDatabase());

async function client() {
  const db = newClient();
  await db.connect();
  return db;
}

async function setup(db) {
  const seller = randomUUID();
  const buyer = randomUUID();
  await seedUser(db, seller);
  await seedUser(db, buyer);
  const { listingId } = await seedListing(db, { sellerId: seller });
  const order = await createOrder(db, buyer, listingId);
  return { seller, buyer, order };
}

test("order parties can message across a block and a third party cannot", async () => {
  const db = await client();
  const { seller, buyer, order } = await setup(db);
  const third = randomUUID();
  await seedUser(db, third);
  await asOwner(db);
  await db.query("insert into public.user_blocks (blocker_id, blocked_id) values ($1,$2)", [seller, buyer]);
  await asService(db);
  const inserted = await db.query("insert into public.messages (sender_id,recipient_id,order_id,body) values ($1,$2,$3,'hello') returning id", [buyer, seller, order.id]);
  assert.equal(inserted.rowCount, 1);
  await assert.rejects(
    () => db.query("insert into public.messages (sender_id,recipient_id,order_id,body) values ($1,$2,$3,'nope')", [third, seller, order.id]),
    { code: "42501" },
  );
  await db.end();
});

test("order email claim returns true once under concurrency", async () => {
  const db = await client();
  const { buyer, order } = await setup(db);
  await asService(db);
  assert.equal((await db.query("select public.mkt_claim_order_email($1,'paid',$2) claimed", [order.id, buyer])).rows[0].claimed, true);
  assert.equal((await db.query("select public.mkt_claim_order_email($1,'paid',$2) claimed", [order.id, buyer])).rows[0].claimed, false);
  await db.end();

  const event = `event-${randomUUID()}`;
  const claims = await Promise.all(Array.from({ length: 5 }, async () => {
    const concurrent = await client();
    try {
      await asService(concurrent);
      return (await concurrent.query("select public.mkt_claim_order_email($1,$2,$3) claimed", [order.id, event, buyer])).rows[0].claimed;
    } finally {
      await concurrent.end();
    }
  }));
  assert.equal(claims.filter(Boolean).length, 1);
});
