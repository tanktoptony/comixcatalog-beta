// Activity summaries: replies, @mentions and comments on your lists and
// reviews that haven't been emailed or read yet (notifications.emailed_at,
// read_at both null). Members on "Summary" (the default) get all of them,
// at most once a week and inside the two-a-week cap (emailCap.js); the job
// runs daily so a first notice isn't held for a fixed day. Members on "Right away" get only what the instant sender held back
// (older than INSTANT_GAP_MINUTES); "Off" gets nothing.
//
// Dry run by default (prints who would get what). --apply sends.
// --only=user1,user2 limits to usernames. --out=<dir> writes HTML previews.
// Runs in Actions (activity-emails.yml) because the unsubscribe link must be
// signed with the production EMAIL_UNSUBSCRIBE_SECRET.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildActivityEmail, INSTANT_GAP_MINUTES, prefsFromRow } from "../src/lib/emailPrefs.js";
import { canSendSummary, loadRecentEmails } from "../src/lib/emailCap.js";
import { unsubscribeLink } from "../src/lib/emailUnsubscribe.js";
import { actorNames, loadPendingActivity, sendActivityEmail } from "../src/lib/activityEmailSend.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const option = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const apply = process.argv.includes("--apply");
const only = new Set((option("only") || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
const outDir = option("out");
// Two weeks, so a notice held back by the weekly cap isn't too old to send
// once its turn comes.
const WINDOW_DAYS = 14;

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EMAIL_UNSUBSCRIBE_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (apply && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required with --apply");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
const heldBefore = new Date(Date.now() - INSTANT_GAP_MINUTES * 60_000).toISOString();

const pending = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("notifications").select("user_id").is("emailed_at", null).is("read_at", null)
    .gte("created_at", since).order("id").range(from, from + 999);
  if (error) throw new Error(`pending notifications read failed: ${error.message}`);
  pending.push(...(data ?? []));
  if ((data?.length ?? 0) < 1000) break;
}
const userIds = [...new Set(pending.map((row) => String(row.user_id)))];
console.log(`${userIds.length} members have unemailed, unread activity from the last ${WINDOW_DAYS} days.`);

const settings = new Map();
const profiles = new Map();
for (let i = 0; i < userIds.length; i += 200) {
  const chunk = userIds.slice(i, i + 200);
  const [{ data: rows, error }, { data: people, error: peopleError }] = await Promise.all([
    db.from("notification_settings").select("*").in("user_id", chunk),
    db.from("profiles").select("id, username").in("id", chunk),
  ]);
  if (error) throw new Error(`settings read failed: ${error.message}`);
  if (peopleError) throw new Error(`profiles read failed: ${peopleError.message}`);
  for (const row of rows ?? []) settings.set(String(row.user_id), row);
  for (const person of people ?? []) profiles.set(String(person.id), person);
}

let sent = 0;
let skipped = 0;
let held = 0;
for (const userId of userIds) {
  const username = profiles.get(userId)?.username ?? userId;
  if (only.size && !only.has(String(username).toLowerCase())) continue;
  const mode = prefsFromRow(settings.get(userId)).email_activity;
  if (mode === "off") { skipped += 1; continue; }
  const rows = (await loadPendingActivity(db, userId, { olderThan: mode === "instant" ? heldBefore : null }))
    .filter((row) => row.created_at >= since);
  if (!rows.length) continue;
  if (mode !== "instant") {
    try {
      if (!canSendSummary(await loadRecentEmails(db, userId, { mode }))) { held += 1; continue; }
    } catch (error) {
      console.error(`skipped @${username}: ${error.message}`);
      skipped += 1;
      continue;
    }
  }
  const { data: auth, error: authError } = await db.auth.admin.getUserById(userId);
  const email = auth?.user?.email;
  if (authError || !email || !auth.user.email_confirmed_at) { skipped += 1; continue; }
  const unsubscribeUrl = unsubscribeLink("activity", userId);
  if (outDir) {
    const names = await actorNames(db, rows);
    const items = rows.map((row) => ({ kind: row.kind, actor: names.get(String(row.actor_id)) ?? null, label: row.label, excerpt: row.excerpt, url: row.url }));
    const preview = buildActivityEmail({ items, mode: "daily", unsubscribeUrl });
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, `activity-${String(username).replace(/[^a-z0-9._-]/gi, "_")}.html`), preview.html);
  }
  if (!apply) {
    console.log(`would email @${username} (${mode}): ${rows.length} ${rows.length === 1 ? "item" : "items"}`);
    continue;
  }
  try {
    if (await sendActivityEmail(db, { userId, email, rows, mode: "daily", unsubscribeUrl })) {
      sent += 1;
      console.log(`emailed @${username}: ${rows.length}`);
    }
  } catch (error) {
    console.error(`failed for @${username}: ${error.message}`);
  }
}
console.log(`${apply ? `Sent ${sent}` : "Dry run"}; ${held} held for the weekly cap, ${skipped} skipped (off, no confirmed email or a failed check).`);
