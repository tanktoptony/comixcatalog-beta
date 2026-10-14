import { readFile } from "node:fs/promises";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

let postgres;
let databaseDir;
let port;

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = server.address().port;
      server.close(() => resolve(value));
    });
  });
}

export async function startDatabase() {
  // Some locked-down Windows runners make uv_os_get_passwd fail even though
  // initdb itself works. embedded-postgres only uses this value to detect root.
  try {
    os.userInfo();
  } catch {
    os.userInfo = () => ({ uid: -1, gid: -1, username: "postgres", homedir: tmpdir(), shell: null });
    syncBuiltinESMExports();
  }
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  databaseDir = await mkdtemp(join(tmpdir(), "cc-orders-"));
  port = await freePort();
  postgres = new EmbeddedPostgres({
    databaseDir, user: "postgres", password: randomBytes(16).toString("hex"), port, persistent: false,
    onLog: () => {}, onError: () => {}, initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("orders_test");
  const client = postgres.getPgClient("orders_test");
  await client.connect();
  const fixture = await readFile(new URL("./fixture.sql", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../scripts/migrations/0066_marketplace_orders.sql", import.meta.url), "utf8");
  const sellersMigration = await readFile(new URL("../../scripts/migrations/0068_seller_accounts.sql", import.meta.url), "utf8");
  const payoutsMigration = await readFile(new URL("../../scripts/migrations/0070_stripe_events_payouts.sql", import.meta.url), "utf8");
  await client.query(fixture);
  await client.query(migration);
  await client.query(sellersMigration);
  await client.query(payoutsMigration);
  await client.end();
}

export function newClient() {
  return postgres.getPgClient("orders_test");
}

export async function stopDatabase() {
  try {
    if (postgres && process.platform === "win32" && postgres.process) {
      const pgCtl = join(process.cwd(), "node_modules", "@embedded-postgres", "windows-x64", "native", "bin", "pg_ctl.exe");
      await execFileAsync(pgCtl, ["-D", databaseDir, "stop", "-m", "immediate", "-w"]);
      postgres.process = undefined;
    } else if (postgres) {
      await postgres.stop();
    }
  } finally {
    if (databaseDir) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await rm(databaseDir, { recursive: true, force: true });
          break;
        } catch (error) {
          if (attempt === 9) throw error;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
  }
}

export async function asService(client) {
  await client.query("reset role");
  await client.query("set role service_role");
  await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: "service_role" })]);
}

export async function asUser(client, uid) {
  await client.query("reset role");
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: "authenticated", sub: uid })]);
}

export async function asOwner(client) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '', false)");
}

export async function seedUser(client, id, { visible = true, confirmed = true } = {}) {
  await asOwner(client);
  await client.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)", [id, `${id}@test.invalid`, confirmed ? new Date() : null]);
  await client.query("insert into public.profiles(id,username,is_public,show_for_sale) values($1,$2,$3,$3)", [id, visible ? `u${id.replaceAll("-", "").slice(0, 8)}` : null, visible]);
}

export async function seedListing(client, { sellerId, priceCents = 5000, shippingCents = 0, issue = 1, onboarded = true, tier = "new" }) {
  await asOwner(client);
  if (onboarded) await client.query(`insert into public.seller_accounts(user_id,stripe_account_id,charges_enabled,payouts_enabled,details_submitted,tier)
    values($1,$2,true,true,true,$3) on conflict(user_id) do nothing`, [sellerId, `acct_${sellerId}`, tier]);
  const collection = await client.query(`insert into public.user_collections
    (user_id,gcd_issue_id,status,variant_label,copy_number,condition,grade_numeric)
    values($1,$2,'for_sale','Cover A',1,'NM',9.4) returning id`, [sellerId, issue]);
  const listing = await client.query(`insert into public.listings
    (seller_id,collection_id,gcd_issue_id,status,series_title,issue_number,release_year,publisher,variant_label,condition,grade_numeric,price_cents,shipping_cents)
    values($1,$2,$3::int,'active','Fixture Series',($3::int)::text,2026,'Fixture Publisher','Cover A','NM',9.4,$4,$5) returning id`,
  [sellerId, collection.rows[0].id, issue, priceCents, shippingCents]);
  return { collectionId: collection.rows[0].id, listingId: listing.rows[0].id };
}

export async function createOrder(client, buyerId, listingId, requestId = "test") {
  await asService(client);
  return (await client.query("select * from public.order_create($1,$2,$3)", [buyerId, listingId, requestId])).rows[0];
}

export async function transition(client, orderId, to, actorId, role, payload = {}, requestId = null, eventId = null) {
  await asService(client);
  return (await client.query("select * from public.order_transition($1,$2,$3,$4,$5,$6,$7)", [orderId, to, actorId, role, payload, requestId, eventId])).rows[0];
}
