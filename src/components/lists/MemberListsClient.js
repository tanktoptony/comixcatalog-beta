"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import ListCard from "./ListCard";
import styles from "./Lists.module.css";

export default function MemberListsClient({ owner, initialLists }) {
  const { user, loading: authLoading } = useAuth();
  const [lists, setLists] = useState(initialLists);
  const [fetched, setFetched] = useState(false);
  const isOwner = user?.id === owner.id;
  // The owner's private lists only come from the API, so show skeletons
  // until that read finishes.
  const loading = !authLoading && isOwner && !fetched;

  useEffect(() => {
    if (authLoading || !isOwner) return;

    let cancelled = false;
    authedFetch("/api/lists?view=cards")
      .then(async (response) => {
        const body = await response.json();
        if (!cancelled && response.ok) setLists(body);
      })
      .finally(() => {
        if (!cancelled) setFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isOwner]);

  if (loading) {
    return (
      <div className={styles.skeletonGrid} aria-label="Loading your lists">
        {[0, 1, 2].map((index) => (
          <div key={index} className={styles.skeleton} />
        ))}
      </div>
    );
  }

  if (!lists.length) {
    return (
      <div className={styles.empty}>
        {isOwner ? "You haven't made a list yet." : "No public lists yet."}
      </div>
    );
  }

  return (
    <section className={styles.grid}>
      {lists.map((list) => (
        <ListCard key={list.id} list={list} username={owner.username} />
      ))}
    </section>
  );
}

export function PrivateMemberListsGate({ owner }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className={styles.skeletonGrid} aria-label="Loading your lists">
        {[0, 1, 2].map((index) => (
          <div key={index} className={styles.skeleton} />
        ))}
      </div>
    );
  }

  if (user?.id !== owner.id) {
    return <div className={styles.empty}>This member&apos;s lists are private.</div>;
  }

  return <MemberListsClient owner={owner} initialLists={[]} />;
}
