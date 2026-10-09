import { resendBatch } from "./newsletter.js";

export const THROTTLE_HOURS = 6;

const INBOX_URL = "https://www.comixcatalog.com/inbox";
const SETTINGS_URL = "https://www.comixcatalog.com/account#notifications";
let warnedMissingResendKey = false;

export function shouldEmail({ optedOut, lastEmailedAt, now }) {
  if (optedOut) return false;
  if (!lastEmailedAt) return true;

  const last = new Date(lastEmailedAt).getTime();
  const current = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return current - last >= THROTTLE_HOURS * 60 * 60 * 1000;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function notifyRecipient({
  supabase,
  senderId,
  senderUsername,
  recipientId,
  recipientUsername,
}) {
  try {
    const [settingsResult, logResult] = await Promise.all([
      supabase
        .from("notification_settings")
        .select("email_on_message")
        .eq("user_id", recipientId)
        .maybeSingle(),
      supabase
        .from("message_email_log")
        .select("last_emailed_at")
        .eq("recipient_id", recipientId)
        .eq("sender_id", senderId)
        .maybeSingle(),
    ]);
    if (settingsResult.error) {
      throw new Error(`notification settings lookup failed: ${settingsResult.error.message}`);
    }
    if (logResult.error) {
      throw new Error(`message email log lookup failed: ${logResult.error.message}`);
    }

    const now = new Date();
    if (!shouldEmail({
      optedOut: settingsResult.data?.email_on_message === false,
      lastEmailedAt: logResult.data?.last_emailed_at,
      now,
    })) return;

    if (!process.env.RESEND_API_KEY) {
      if (!warnedMissingResendKey) {
        console.warn("Message email skipped: RESEND_API_KEY is not set.");
        warnedMissingResendKey = true;
      }
      return;
    }

    const { error: logError } = await supabase.from("message_email_log").upsert({
      recipient_id: recipientId,
      sender_id: senderId,
      last_emailed_at: now.toISOString(),
    });
    if (logError) throw new Error(`message email log upsert failed: ${logError.message}`);

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(recipientId);
    if (authError) throw new Error(`recipient email lookup failed: ${authError.message}`);
    const email = authData?.user?.email;
    if (!email) throw new Error(`recipient email lookup failed: no email for @${recipientUsername}`);

    const sender = String(senderUsername);
    const escapedSender = escapeHtml(sender);
    const threadUrl = `${INBOX_URL}/${encodeURIComponent(sender)}`;
    const subject = `@${sender} sent you a message on ComixCatalog`;
    await resendBatch([{
      to: email,
      subject,
      text: `@${sender} sent you a message on ComixCatalog.\n\nRead and reply: ${threadUrl}\n\nYou get one email per conversation every few hours at most. Turn these off: ${SETTINGS_URL}`,
      html: `<p style="font-family:Arial,sans-serif;color:#222">@${escapedSender} sent you a message on ComixCatalog.</p><p><a href="${threadUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif">Read and reply</a></p><p style="font-family:Arial,sans-serif;font-size:12px;color:#666">You get one email per conversation every few hours at most. Turn these off: <a href="${SETTINGS_URL}">${SETTINGS_URL}</a></p>`,
      headers: { "List-Unsubscribe": `<${SETTINGS_URL}>` },
    }]);
  } catch (error) {
    console.error("Message email notification failed:", error);
  }
}
