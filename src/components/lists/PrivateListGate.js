"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import ListView from "./ListView";
import styles from "./ListPage.module.css";

function LoadingState() {
  return (
    <main className={styles.page} aria-label="Loading private list">
      <div className={styles.skeletonHero} />
      <div className={styles.skeletonCards}>
        <div className={styles.skeletonCard} />
        <div className={styles.skeletonCard} />
      </div>
    </main>
  );
}

export default function PrivateListGate({ username, slug, ownerId }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [fetched, setFetched] = useState(false);
  const isOwner = Boolean(user) && user.id === ownerId;
  const loading = isOwner && !fetched;

  useEffect(() => {
    if (authLoading || !isOwner) return undefined;

    let cancelled = false;
    authedFetch(
      `/api/lists/by-path?username=${encodeURIComponent(username)}&slug=${encodeURIComponent(slug)}`
    )
      .then(async (response) => {
        const body = await response.json();
        if (!cancelled && response.ok) setData(body);
      })
      .finally(() => {
        if (!cancelled) setFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isOwner, slug, username]);

  if (authLoading || loading) return <LoadingState />;
  if (data) return <ListView initialData={data} />;

  return (
    <main className={styles.page}>
      <div className={styles.privateState}>
        <h1>List unavailable</h1>
        <p>This list is private or doesn&apos;t exist.</p>
      </div>
    </main>
  );
}
