import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asOwner, asService, asUser, createOrder, newClient, seedListing, seedUser, startDatabase, stopDatabase } from "./harness.js";

before(async () => startDatabase());
after(async () => stopDatabase());

async function dbClient() { const db = newClient(); await db.connect(); return db; }
async function setup(db, options = {}) {
  const sellerId = randomUUID(), buyerId = randomUUID();
  await seedUser(db, sellerId); await seedUser(db, buyerId);
  return { sellerId, buyerId, ...await seedListing(db, { sellerId, ...options }) };
}
async function block(db, listingId) { await asService(db); return (await db.query("select public.mkt_listing_checkout_block($1) block", [listingId])).rows[0].block; }
async function photo(db, s, kind) { await asOwner(db); await db.query("insert into public.listing_photos(listing_id,collection_id,owner_id,storage_path,thumb_path,kind) values($1,$2,$3,$4,$4,$5)", [s.listingId,s.collectionId,s.sellerId,`${kind}-${randomUUID()}`,kind]); }

test("onboarding, mode, and restricted tiers return stable blocks", async () => {
  const db = await dbClient();
  const none = await setup(db, { onboarded: false });
  assert.equal(await block(db, none.listingId), "seller_not_onboarded");
  await assert.rejects(() => createOrder(db, none.buyerId, none.listingId), { code: "55006", message: /seller_not_onboarded/ });
  await asOwner(db); await db.query("insert into public.seller_accounts(user_id,stripe_account_id,charges_enabled,details_submitted) values($1,$2,true,false)", [none.sellerId,`acct_${none.sellerId}`]);
  assert.equal(await block(db, none.listingId), "seller_not_onboarded");
  await asOwner(db); await db.query("update public.seller_accounts set details_submitted=true,livemode=true where user_id=$1", [none.sellerId]);
  assert.equal(await block(db, none.listingId), "seller_not_onboarded");
  for (const tier of ["limited","suspended"]) { await asOwner(db); await db.query("update public.seller_accounts set livemode=false,tier=$2 where user_id=$1", [none.sellerId,tier]); assert.equal(await block(db, none.listingId), "seller_restricted"); }
  await db.end();
});

test("slab certification and high-value photos gate checkout", async () => {
  const db = await dbClient(); const s = await setup(db, { priceCents: 10000 });
  await asOwner(db); await db.query("update public.listings set slab_company='CGC',slab_cert_number=null where id=$1", [s.listingId]);
  assert.equal(await block(db,s.listingId), "slab_needs_cert");
  await asOwner(db); await db.query("update public.listings set slab_cert_number='123' where id=$1", [s.listingId]);
  assert.equal(await block(db,s.listingId), "needs_photos"); await photo(db,s,"front"); assert.equal(await block(db,s.listingId), "needs_photos"); await photo(db,s,"back"); assert.equal(await block(db,s.listingId), null);
  const low = await setup(db,{ priceCents:9999,issue:2 }); assert.equal(await block(db,low.listingId),null); await db.end();
});

test("new seller price and listing caps do not restrict established sellers", async () => {
  const db=await dbClient(); const high=await setup(db,{priceCents:100001}); await photo(db,high,"front"); await photo(db,high,"back");
  assert.equal(await block(db,high.listingId),"new_seller_price_cap"); await asOwner(db); await db.query("update public.seller_accounts set tier='established' where user_id=$1",[high.sellerId]); assert.equal(await block(db,high.listingId),null);
  const capped=await setup(db,{issue:100}); for(let i=0;i<25;i++) await seedListing(db,{sellerId:capped.sellerId,issue:101+i}); assert.equal(await block(db,capped.listingId),"new_seller_listing_cap"); await db.end();
});

test("new seller open order cap includes item and shipping", async () => {
  const db=await dbClient(); const s=await setup(db,{priceCents:15000}); await photo(db,s,"front"); await photo(db,s,"back");
  await asOwner(db); await db.query(`insert into public.orders(listing_id,buyer_id,seller_id,series_title,item_cents,shipping_cents,tax_cents,total_cents,platform_fee_cents,processing_fee_cents,seller_net_cents,status) values
    (null,$1,$2,'A',95000,0,0,95000,0,0,95000,'paid'),(null,$1,$2,'B',95000,0,0,95000,0,0,95000,'paid')`,[s.buyerId,s.sellerId]);
  assert.equal(await block(db,s.listingId),"new_seller_open_order_cap"); await asOwner(db); await db.query("update public.listings set price_cents=10000 where id=$1",[s.listingId]); assert.equal(await block(db,s.listingId),null); await db.end();
});

test("Stripe account cannot be swapped and no-op upsert is not audited", async () => {
  const db=await dbClient(); const s=await setup(db); await asService(db);
  const before=(await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1",[s.sellerId])).rows[0].n;
  await db.query("select public.mkt_upsert_seller_account($1,$2,false,true,true,true,'[]')",[s.sellerId,`acct_${s.sellerId}`]);
  assert.equal((await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1",[s.sellerId])).rows[0].n,before);
  await assert.rejects(()=>db.query("select public.mkt_upsert_seller_account($1,'acct_other',false,true,true,true,'[]')",[s.sellerId]),{code:"55000"}); await db.end();
});

test("seller account RLS and admin tier audit", async () => {
  const db=await dbClient(); const a=await setup(db), b=await setup(db,{issue:3}); await asUser(db,a.sellerId);
  assert.deepEqual((await db.query("select user_id from public.seller_accounts order by user_id")).rows.map(r=>r.user_id),[a.sellerId]);
  await assert.rejects(()=>db.query("update public.seller_accounts set tier='established' where user_id=$1",[a.sellerId]),{code:"42501"});
  await assert.rejects(()=>db.query("insert into public.seller_accounts(user_id) values($1)",[randomUUID()]),{code:"42501"});
  await asService(db); await assert.rejects(()=>db.query("select public.seller_set_tier($1,$2,'established','x')",[b.buyerId,b.sellerId]),{code:"22023"});
  await db.query("select public.seller_set_tier($1,$2,'established','manual review complete')",[b.buyerId,b.sellerId]);
  assert.equal((await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1 and action='tier_set'",[b.sellerId])).rows[0].n,1); await db.end();
});

test("five completions promote unless a buyer-won dispute is recorded", async () => {
  const db=await dbClient();
  for (const disputed of [false,true]) {
    const s=await setup(db,{issue:disputed?501:500}); await asOwner(db);
    const ids=[];
    for(let i=0;i<5;i++) {
      const row=await db.query(`insert into public.orders(listing_id,buyer_id,seller_id,series_title,item_cents,shipping_cents,tax_cents,total_cents,platform_fee_cents,processing_fee_cents,seller_net_cents,status)
        values(null,$1,$2,'Promotion',100,0,0,100,0,0,100,'created') returning id`,[s.buyerId,s.sellerId]); ids.push(row.rows[0].id);
    }
    if(disputed) await db.query("insert into public.order_disputes(order_id,kind,opened_by,status,reason_text,resolution_note,resolved_at) values($1,'not_received',$2,'resolved_buyer','Package did not arrive','Refunded buyer',now())",[ids[0],s.buyerId]);
    for(const id of ids) await db.query("update public.orders set status='completed' where id=$1",[id]);
    const seller=(await db.query("select tier,completed_orders from public.seller_accounts where user_id=$1",[s.sellerId])).rows[0];
    assert.equal(seller.completed_orders,5); assert.equal(seller.tier,disputed?"new":"established");
    assert.equal((await db.query("select count(*)::int n from public.marketplace_audit_log where entity_id=$1 and action='tier_promoted'",[s.sellerId])).rows[0].n,disputed?0:1);
  }
  await db.end();
});
