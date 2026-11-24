import { notFound } from "next/navigation";
import Link from "next/link";
import MemberListsClient, {
  PrivateMemberListsGate,
} from "@/components/lists/MemberListsClient";
import styles from "@/components/lists/Lists.module.css";
import { getUserLists } from "@/lib/listsData";
import { getServiceClient } from "@/lib/supabase/service";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `@${username}'s comic lists` };
}

export default async function MemberListsPage({ params }) {
  const { username } = await params;
  const db = getServiceClient();
  const { data: owner, error } = await db
    .from("profiles")
    .select("id,username,is_public")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  if (!owner) notFound();

  const publicLists = owner.is_public === false ? [] : await getUserLists(owner.id);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>@{username}&apos;s lists</h1>
          <p className={styles.intro}>Curated shelves and reading orders.</p>
        </div>
        <Link className={styles.button} href="/lists/new">
          New list
        </Link>
      </header>
      {owner.is_public === false ? (
        <PrivateMemberListsGate owner={owner} />
      ) : (
        <MemberListsClient owner={owner} initialLists={publicLists} />
      )}
    </main>
  );
}
