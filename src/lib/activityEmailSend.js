import { resendBatch } from "./newsletter.js";
import { buildActivityEmail, instantDue, prefsFromRow } from "./emailPrefs.js";

// Activity emails (replies, @mentions, comments on your lists and reviews)
// for members who chose "Right away". Called after a comment's notification
// rows are written. A member gets at most one email per INSTANT_GAP_MINUTES;
// anything held back rides along with the next one, or the daily run
// (scripts/sendActivityEmails.js) sweeps it up. Never throws.
//
// Rows are claimed by setting notifications.emailed_at before sending (only
// rows still unclaimed come back), so two comments landing at once can't send
// the same notification twice. A failed send releases the claim.

const PENDING_LIMIT = 20;

export async function loadPendingActivity(db, userId, { limit = PENDING_LIMIT, olderThan = null } = {}) {
  let query = db.from("notifications").select("id, actor_id, kind, url, label, excerpt, created_at")
    .eq("user_id", userId).is("emailed_at", null).is("read_at", null)
    .order("created_at", { ascending: false }).limit(limit);
  if (olderThan) query = query.lte("created_at", olderThan);
  const { data, error } = await query;
  if (error) throw new Error(`pending activity read failed: ${error.message}`);
  return data ?? [];
}

export async function actorNames(db, rows) {
  const ids = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await db.from("profiles").select("id, username").in("id", ids);
  if (error) throw new Error(`actor lookup failed: ${error.message}`);
  return new Map((data ?? []).map((row) => [String(row.id), row.username]));
}

// Claim, send, release on failure. Returns true when an email went out.
export async function sendActivityEmail(db, { userId, email, rows, mode, unsubscribeUrl }) {
  const now = new Date().toISOString();
  const { data: claimed, error } = await db.from("notifications").update({ emailed_at: now })
    .in("id", rows.map((row) => row.id)).is("emailed_at", null).select("id");
  if (error) throw new Error(`activity claim failed: ${error.message}`);
  const claimedIds = new Set((claimed ?? []).map((row) => String(row.id)));
  const mine = rows.filter((row) => claimedIds.has(String(row.id)));
  if (!mine.length) return false;
  const names = await actorNames(db, mine);
  const items = mine.map((row) => ({ kind: row.kind, actor: names.get(String(row.actor_id)) ?? null, label: row.label, excerpt: row.excerpt, url: row.url }));
  const message = buildActivityEmail({ items, mode, unsubscribeUrl });
  try {
    await resendBatch([{ to: email, subject: message.subject, html: message.html, text: message.text, headers: { "List-Unsubscribe": `<${unsubscribeUrl ?? "https://www.comixcatalog.com/account#notifications"}>` } }]);
    return true;
  } catch (sendError) {
    await db.from("notifications").update({ emailed_at: null }).in("id", [...claimedIds]);
    throw sendError;
  }
}

async function lastEmailedAt(db, userId) {
  const { data, error } = await db.from("notifications").select("emailed_at")
    .eq("user_id", userId).not("emailed_at", "is", null).order("emailed_at", { ascending: false }).limit(1);
  if (error) throw new Error(`last activity email read failed: ${error.message}`);
  return data?.[0]?.emailed_at ?? null;
}

export async function emailInstantActivityForComment(db, commentId) {
  try {
    if (!process.env.RESEND_API_KEY || !commentId) return 0;
    const { data: notes, error } = await db.from("notifications").select("user_id").eq("comment_id", commentId);
    if (error) throw new Error(`comment notifications read failed: ${error.message}`);
    const userIds = [...new Set((notes ?? []).map((row) => String(row.user_id)))];
    if (!userIds.length) return 0;
    const { data: settings, error: settingsError } = await db.from("notification_settings").select("user_id, email_activity").in("user_id", userIds);
    if (settingsError) throw new Error(`activity settings read failed: ${settingsError.message}`);
    const instant = (settings ?? []).filter((row) => prefsFromRow(row).email_activity === "instant").map((row) => String(row.user_id));
    let sent = 0;
    for (const userId of instant) {
      if (!instantDue(await lastEmailedAt(db, userId))) continue;
      const rows = await loadPendingActivity(db, userId);
      if (!rows.length) continue;
      const { data: auth, error: authError } = await db.auth.admin.getUserById(userId);
      if (authError || !auth?.user?.email) continue;
      if (await sendActivityEmail(db, { userId, email: auth.user.email, rows, mode: "instant" })) sent += 1;
    }
    return sent;
  } catch (error) {
    console.error("instant activity email failed:", error?.message ?? error);
    return 0;
  }
}
