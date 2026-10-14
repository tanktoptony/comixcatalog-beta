import { redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import InviteLandingActions from "@/components/InviteLandingActions";
import { getFoundingRemaining } from "@/lib/foundingStatus";
import { normalizeInviteRef } from "@/lib/invites";
import { getServiceClient } from "@/lib/supabase/service";
import styles from "./join.module.css";

async function getInviter(rawUsername) {
  const username = normalizeInviteRef(rawUsername);
  if (!username) return null;
  const { data, error } = await getServiceClient()
    .from("profiles")
    .select("id, username, display_name, avatar_url, avatar_key, is_public, is_founding_collector")
    .eq("username", username)
    .maybeSingle();
  if (error) throw new Error(`invite profile lookup failed: ${error.message}`);
  return data;
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  const clean = normalizeInviteRef(username);
  if (!clean) return {};
  return {
    title: `Join @${clean}`,
    description: `Catalog your comics with @${clean} on ComixCatalog.`,
    openGraph: {
      title: `Join @${clean} on ComixCatalog`,
      description: `Catalog your comics with @${clean} on ComixCatalog.`,
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
  };
}

export default async function JoinPage({ params }) {
  const { username } = await params;
  const [inviter, foundingRemaining] = await Promise.all([
    getInviter(username),
    getFoundingRemaining(),
  ]);
  if (!inviter) redirect("/signup");
  const name = inviter.is_public && inviter.display_name ? inviter.display_name : `@${inviter.username}`;

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="invite-title">
        <Avatar profile={inviter} className={styles.avatar} width={104} height={104} alt="" />
        <p className={styles.eyebrow}>A collector invited you</p>
        <h1 id="invite-title">{name} invited you to ComixCatalog</h1>
        {name !== `@${inviter.username}` && <p className={styles.handle}>@{inviter.username}</p>}
        <p className={styles.lede}>Catalog your collection, scan covers, and keep track of the comics you want.</p>
        {Number.isFinite(foundingRemaining) && foundingRemaining > 0 && (
          <p className={styles.founding}>{foundingRemaining} founding spots left</p>
        )}
        <InviteLandingActions inviter={{ id: inviter.id, username: inviter.username }} />
      </section>
    </main>
  );
}
