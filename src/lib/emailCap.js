// No member gets more than two automatic emails a week (Tony, 2026-11-24):
// activity summaries, the weekly digest and new-member nudges share the cap.
// Counted from the records those emails already leave, so there is no table
// to keep in step. Not counted: direct message emails, purchases and account
// emails (someone or something is waiting on them), and "Right away" activity
// emails, which a member has to ask for.
//
// Relative imports only: scripts load this from plain Node.

export const WEEKLY_EMAIL_CAP = 2;
// Half a day short of a week. The jobs run on GitHub's schedule and start
// hours late, so a full week would let last Sunday's late digest block this
// Sunday's on-time one.
export const CAP_WINDOW_HOURS = 156;

const since = (now) => now.getTime() - CAP_WINDOW_HOURS * 3_600_000;

// Sends in the window. One activity email stamps every row it carried with
// the same emailed_at, so distinct times are emails.
export function recentEmails({ activityAt = [], campaignAt = [], nudgeAt = [], mode = "daily" }, now = new Date()) {
  const inWindow = (values) => values.filter(Boolean).map((value) => new Date(value).getTime()).filter((time) => time >= since(now));
  const activity = new Set(inWindow(activityAt)).size;
  const counted = mode === "instant" ? 0 : activity;
  return { activity, total: counted + inWindow(campaignAt).length + inWindow(nudgeAt).length };
}

// A summary also waits a week after the last one, which leaves the second
// slot for the digest.
export const canSendSummary = (recent) => recent.activity === 0 && recent.total < WEEKLY_EMAIL_CAP;
export const canSendOther = (recent) => recent.total < WEEKLY_EMAIL_CAP;

export async function loadRecentEmails(db, userId, { mode = "daily", now = new Date() } = {}) {
  const from = new Date(since(now)).toISOString();
  const [activity, campaigns, profile] = await Promise.all([
    // review_queue rows are stamped emailed without an email going out.
    db.from("notifications").select("emailed_at").eq("user_id", userId).neq("kind", "review_queue").gte("emailed_at", from).limit(1000),
    db.from("email_campaign_sends").select("sent_at").eq("user_id", userId).gte("sent_at", from).limit(100),
    db.from("profiles").select("nudge1_sent_at, nudge2_sent_at").eq("id", userId).maybeSingle(),
  ]);
  for (const result of [activity, campaigns, profile]) {
    if (result.error) throw new Error(`recent emails read failed: ${result.error.message}`);
  }
  return recentEmails({
    activityAt: (activity.data ?? []).map((row) => row.emailed_at),
    campaignAt: (campaigns.data ?? []).map((row) => row.sent_at),
    nudgeAt: [profile.data?.nudge1_sent_at, profile.data?.nudge2_sent_at],
    mode,
  }, now);
}
