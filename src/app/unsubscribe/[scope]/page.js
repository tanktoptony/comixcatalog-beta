import Link from "next/link";
import { notFound } from "next/navigation";
import { UNSUBSCRIBE_SCOPES, verifyUnsubscribeToken } from "@/lib/emailUnsubscribe";
import { getServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// One-click unsubscribe for the activity emails and the weekly digest. The
// tips link has its own page (/unsubscribe/tips).
const COPY = {
  activity: { change: { email_activity: "off" }, done: "You won't get any more emails about replies, mentions and comments." },
  digest: { change: { email_weekly_digest: false }, done: "You won't get the weekly digest anymore." },
};

export default async function UnsubscribePage({ params, searchParams }) {
  const { scope } = await params;
  if (!UNSUBSCRIBE_SCOPES.includes(scope)) notFound();
  const { token } = await searchParams;
  const userId = verifyUnsubscribeToken(scope, token);
  let success = false;
  if (userId) {
    const { error } = await getServiceClient().from("notification_settings")
      .upsert({ user_id: userId, ...COPY[scope].change, updated_at: new Date().toISOString() });
    if (error) console.error("unsubscribe failed:", scope, error.message);
    success = !error;
  }

  return (
    <main style={{ maxWidth: 620, margin: "80px auto", padding: "24px", textAlign: "center" }}>
      <h1>{success ? "You're unsubscribed" : "That link isn't valid"}</h1>
      <p>{success ? COPY[scope].done : "The unsubscribe link is invalid. You can change this in your account settings."}</p>
      <p><Link href="/account#notifications">{success ? "Change your email settings" : "Account settings"}</Link></p>
    </main>
  );
}
