import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NORMALIZE_EMAIL_TEST_VECTORS } from "../../src/lib/normalizeEmail.js";
import { asOwner, asService, asUser, newClient, startDatabase, stopDatabase } from "./harness.js";

before(async () => startDatabase());
after(async () => stopDatabase());

async function client() {
  const db = newClient();
  await db.connect();
  return db;
}

async function seed(db, email) {
  const id = randomUUID();
  await asOwner(db);
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, email]);
  await db.query("insert into public.profiles(id,username) values($1,$2)", [id, `u${id.replaceAll("-", "").slice(0, 8)}`]);
  return id;
}

async function claim(db, id) {
  await asService(db);
  return (await db.query("select * from public.claim_founding_pass($1)", [id])).rows[0];
}

test("SQL normalization agrees with the shared JS vectors", async () => {
  const db = await client();
  for (const { input, expected } of NORMALIZE_EMAIL_TEST_VECTORS) {
    assert.equal((await db.query("select public.normalize_email($1) value", [input])).rows[0].value, expected, input);
  }
  await db.end();
});

test("plus tags and Gmail dots cannot claim a second pass or change the cap count", async () => {
  const db = await client();
  const founder = await seed(db, "a.x@gmail.com");
  const plus = await seed(db, "a.x+x@gmail.com");
  const dotted = await seed(db, "ax@gmail.com");
  assert.equal((await claim(db, founder)).claimed, true);
  assert.equal((await claim(db, plus)).claimed, false);
  assert.equal((await claim(db, dotted)).claimed, false);
  await asOwner(db);
  assert.equal((await db.query("select count(*)::int n from public.profiles where is_founding_collector")).rows[0].n, 1);
  await db.end();
});

test("the advisory lock still keeps concurrent claims inside the cap", async () => {
  const setup = await client();
  await asOwner(setup);
  await setup.query("update public.profiles set is_founding_collector=true, is_pro=true");
  const current = (await setup.query("select count(*)::int n from public.profiles where is_founding_collector")).rows[0].n;
  for (let i = current; i < 99; i++) {
    const id = await seed(setup, `founder-${i}@example.com`);
    await setup.query("update public.profiles set is_founding_collector=true, is_pro=true where id=$1", [id]);
  }
  const candidates = [];
  for (let i = 0; i < 8; i++) candidates.push(await seed(setup, `race-${i}@example.com`));
  await setup.end();

  const results = await Promise.all(candidates.map(async (id) => {
    const db = await client();
    try { return await claim(db, id); } finally { await db.end(); }
  }));
  assert.equal(results.filter((row) => row.claimed).length, 1);
  const check = await client();
  assert.equal((await check.query("select count(*)::int n from public.profiles where is_founding_collector")).rows[0].n, 100);
  await check.end();
});

test("founding_inbox_taken matches the claim rule and is service-role only", async () => {
  const db = await client();
  const founder = await seed(db, "pre.check@gmail.com");
  await asOwner(db);
  await db.query("update public.profiles set is_founding_collector=true, is_pro=true where id=$1", [founder]);
  const variant = await seed(db, "precheck+again@googlemail.com");
  const stranger = await seed(db, "someone-new@example.com");
  await asService(db);
  const taken = async (id) => (await db.query("select public.founding_inbox_taken($1) v", [id])).rows[0].v;
  assert.equal(await taken(variant), true);
  assert.equal(await taken(stranger), false);
  assert.equal(await taken(founder), false);
  await asUser(db, variant);
  await assert.rejects(db.query("select public.founding_inbox_taken($1)", [variant]), /permission denied/);
  await db.end();
});
