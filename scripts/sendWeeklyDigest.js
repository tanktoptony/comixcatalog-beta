// Weekly digest: for each member with the digest on (the default), the last
// week of what the collectors they follow added, wanted, listed and reviewed
// (the shelf feed's privacy rules: public profiles only, blocks both ways,
// test accounts never), wantlist books another collector listed, trade
// matches, unread replies and mentions, and the collection's value with the
// shelf's honest week-over-week change. Sent only when there is something
// besides the value line.
//
// Dry run by default. --apply sends. --only=user1,user2, --out=<dir> for HTML
// previews. One send per member per ISO week (email_campaign_sends, claimed
// before sending). Runs in Actions (weekly-digest.yml) for the production
// EMAIL_UNSUBSCRIBE_SECRET.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildDigestEmail, digestCampaign, digestHasNews, prefsFromRow } from "../src/lib/emailPrefs.js";
import { unsubscribeLink } from "../src/lib/emailUnsubscribe.js";
import { feedItems, blockedIds } from "../src/lib/feed/feedEvents.js";
import { changeWindowStart, valueChange } from "../src/lib/shelfHunt.js";
import { TEST_ACCOUNT_USERNAMES } from "../src/lib/traction.js";
import { resendBatch } from "../src/lib/newsletter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const option = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const apply = process.argv.includes("--apply");
const only = new Set((option("only") || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
const outDir = option("out");
const campaign = option("campaign") || digestCampaign();
if (!/^[a-z0-9-]{3,64}$/.test(campaign)) throw new Error("--campaign must be 3-64 lowercase letters, digits or dashes");

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EMAIL_UNSUBSCRIBE_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (apply && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required with --apply");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
const testNames = new Set(TEST_ACCOUNT_USERNAMES.map((name) => name.toLowerCase()));
const PROFILE_COLUMNS = "id, username, is_public, show_collection, show_wantlist, show_for_sale";

function must({ data, error }, what) {
  if (error) throw new Error(`${what} failed: ${error.message}`);
  return data ?? [];
}

async function pages(build, what) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await build().range(from, from + 999), what);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function followingSection(member) {
  const followees = must(await db.from("follows").select("followee_id").eq("follower_id", member.id), "follows").map((row) => String(row.followee_id));
  if (!followees.length) return [];
  const blocked = blockedIds(must(await db.from("user_blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${member.id},blocked_id.eq.${member.id}`), "blocks"), member.id);
  const ids = followees.filter((id) => !blocked.has(id));
  if (!ids.length) return [];
  const people = must(await db.from("profiles").select(PROFILE_COLUMNS).in("id", ids), "followee profiles")
    .filter((p) => p.username && p.is_public === true && !testNames.has(String(p.username).toLowerCase()));
  if (!people.length) return [];
  const peopleIds = people.map((p) => p.id);
  const [rows, listings, reviews] = await Promise.all([
    pages(() => db.from("user_collections").select("user_id, status, gcd_issue_id, created_at").in("user_id", peopleIds)
      .in("status", ["owned", "for_sale", "wishlist"]).not("gcd_issue_id", "is", null).gte("created_at", since).order("id"), "followee books"),
    pages(() => db.from("marketplace_listings").select("id, seller_id, gcd_issue_id, created_at").in("seller_id", peopleIds).gte("created_at", since).order("id"), "followee listings"),
    pages(() => db.from("issue_reviews").select("id, user_id, base_gcd_issue_id, rating, body, created_at, updated_at").in("user_id", peopleIds).gte("updated_at", since).order("id"), "followee reviews"),
  ]);
  const items = feedItems({ rows, listings, reviews, profilesById: new Map(people.map((p) => [String(p.id), p])) });
  const byPerson = new Map(people.map((p) => [String(p.id), { username: p.username, added: new Set(), wanted: new Set(), listed: 0, reviewed: 0 }]));
  for (const item of items) {
    const person = byPerson.get(item.user_id);
    if (!person) continue;
    if (item.verb === "added") person.added.add(item.gcd_issue_id);
    else if (item.verb === "wants") person.wanted.add(item.gcd_issue_id);
    else if (item.verb === "listed") person.listed += 1;
    else if (item.verb === "reviewed" || item.verb === "rated") person.reviewed += 1;
  }
  return [...byPerson.values()].map((p) => ({ ...p, added: p.added.size, wanted: p.wanted.size }))
    .sort((a, b) => (b.added + b.wanted + b.listed + b.reviewed) - (a.added + a.wanted + a.listed + a.reviewed));
}

async function baseIdsFor(ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    for (const row of must(await db.from("gcd_issues").select("gcd_id, variant_of_gcd_id").in("gcd_id", ids.slice(i, i + 300)), "issue bases")) {
      out.set(Number(row.gcd_id), Number(row.variant_of_gcd_id ?? row.gcd_id));
    }
  }
  return out;
}

let recentListings = null;
async function wantlistSection(member) {
  const wanted = (await pages(() => db.from("user_collections").select("gcd_issue_id").eq("user_id", member.id).eq("status", "wishlist").not("gcd_issue_id", "is", null).order("id"), "wantlist"))
    .map((row) => Number(row.gcd_issue_id));
  if (!wanted.length) return [];
  if (!recentListings) {
    const listings = await pages(() => db.from("marketplace_listings").select("id, seller_id, gcd_issue_id, series_title, issue_number, price_cents, created_at").gte("created_at", since).order("id"), "recent listings");
    const bases = await baseIdsFor([...new Set(listings.map((l) => Number(l.gcd_issue_id)))]);
    recentListings = listings.map((l) => ({ ...l, base: bases.get(Number(l.gcd_issue_id)) ?? Number(l.gcd_issue_id) }));
  }
  const wantedBases = new Set((await baseIdsFor([...new Set(wanted)])).values());
  return recentListings.filter((l) => String(l.seller_id) !== String(member.id) && wantedBases.has(l.base))
    .map((l) => ({ title: `${l.series_title || "Untitled"} #${l.issue_number ?? ""}`.trim(), price: l.price_cents != null ? l.price_cents / 100 : null, url: `/listing/${l.id}` }));
}

async function valueSection(member) {
  const [latest] = must(await db.from("collection_value_history").select("total_value, snapshot_date").eq("user_id", member.id).order("snapshot_date", { ascending: false }).limit(1), "latest value");
  if (!latest) return null;
  const [earlier] = must(await db.from("collection_value_history").select("total_value, snapshot_date").eq("user_id", member.id)
    .gte("snapshot_date", changeWindowStart()).order("snapshot_date", { ascending: true }).limit(1), "earlier value");
  const change = valueChange({ total: latest.total_value, snapshot_date: latest.snapshot_date }, earlier ?? null);
  return { total: Number(latest.total_value), change: change?.amount ?? null };
}

async function buildDigest(member) {
  const [following, wantlistListed, value, trades, unread] = await Promise.all([
    followingSection(member),
    wantlistSection(member),
    valueSection(member),
    db.rpc("social_trade_matches", { p_user: member.id }),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", member.id).is("read_at", null),
  ]);
  if (trades.error) throw new Error(`trade matches failed: ${trades.error.message}`);
  if (unread.error) throw new Error(`unread count failed: ${unread.error.message}`);
  return { following, wantlistListed, value, tradeMatches: new Set((trades.data ?? []).map((row) => row.member_id)).size, unread: unread.count ?? 0 };
}

const members = (await pages(() => db.from("profiles").select("id, username").not("username", "is", null).order("id"), "members"))
  .filter((m) => !only.size || only.has(String(m.username).toLowerCase()));
const settingsRows = await pages(() => db.from("notification_settings").select("*").order("user_id"), "settings");
const settings = new Map(settingsRows.map((row) => [String(row.user_id), row]));
const alreadySent = new Set((await pages(() => db.from("email_campaign_sends").select("user_id").eq("campaign", campaign).order("user_id"), "sent ledger")).map((row) => String(row.user_id)));

let sent = 0;
let quiet = 0;
let off = 0;
for (const member of members) {
  if (!prefsFromRow(settings.get(String(member.id))).email_weekly_digest) { off += 1; continue; }
  if (alreadySent.has(String(member.id))) continue;
  let digest;
  try { digest = await buildDigest(member); } catch (error) { console.error(`@${member.username}: ${error.message}`); continue; }
  if (!digestHasNews(digest)) { quiet += 1; continue; }
  const { data: auth } = await db.auth.admin.getUserById(member.id);
  const email = auth?.user?.email;
  if (!email || !auth.user.email_confirmed_at) continue;
  const message = buildDigestEmail({ digest, unsubscribeUrl: unsubscribeLink("digest", member.id) });
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, `digest-${String(member.username).replace(/[^a-z0-9._-]/gi, "_")}.html`), message.html);
  }
  const summary = `${digest.following.filter((p) => p.added + p.wanted + p.listed + p.reviewed > 0).length} followed active, ${digest.wantlistListed.length} wantlist listed, ${digest.tradeMatches} trade, ${digest.unread} unread`;
  if (!apply) { console.log(`would send @${member.username}: "${message.subject}" (${summary})`); continue; }
  const { data: claimed, error: claimError } = await db.from("email_campaign_sends")
    .upsert({ user_id: member.id, campaign }, { onConflict: "user_id,campaign", ignoreDuplicates: true }).select("user_id");
  if (claimError) { console.error(`claim failed for @${member.username}: ${claimError.message}`); continue; }
  if (!claimed?.length) continue;
  try {
    await resendBatch([{ to: email, subject: message.subject, html: message.html, text: message.text, headers: { "List-Unsubscribe": `<${unsubscribeLink("digest", member.id)}>` } }]);
    sent += 1;
    console.log(`sent @${member.username} (${summary})`);
  } catch (error) {
    await db.from("email_campaign_sends").delete().eq("user_id", member.id).eq("campaign", campaign);
    console.error(`send failed for @${member.username}: ${error.message}`);
  }
}
console.log(`${apply ? "Sent" : "Dry run"} ${campaign}: ${apply ? sent : "see above"}; ${quiet} with nothing new, ${off} turned off.`);
