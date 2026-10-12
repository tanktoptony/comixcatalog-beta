import Link from "next/link";
import { verifyTipsUnsubscribeToken } from "@/lib/activationNudges";
import { getServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export default async function UnsubscribeTipsPage({ searchParams }) {
  const { token } = await searchParams;
  const userId = verifyTipsUnsubscribeToken(token);
  let success = false;
  if (userId) {
    const { error } = await getServiceClient().from("profiles").update({ email_tips: false }).eq("id", userId);
    success = !error;
  }

  return (
    <main style={{ maxWidth: 620, margin: "80px auto", padding: "24px", textAlign: "center" }}>
      <h1>{success ? "You're unsubscribed" : "That link isn't valid"}</h1>
      <p>{success ? "You won't receive any more tips to get started." : "The unsubscribe link is invalid. You can change this preference in your account."}</p>
      <Link href={success ? "/" : "/account#notifications"}>{success ? "Back to ComixCatalog" : "Account settings"}</Link>
    </main>
  );
}
