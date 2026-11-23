"use client";

// Conversation list: search, New message, one row per conversation. The
// inbox's left column (rows link to /inbox/<username>) and the chat dock
// (onSelect opens the conversation in place).

import { useMemo, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import EmptyState from "@/components/EmptyState";
import NewMessagePicker from "@/components/inbox/NewMessagePicker";
import { formatTimeAgo } from "@/lib/timeAgo";
import styles from "./ThreadList.module.css";

export default function ThreadList({ threads, error, activeUsername = null, variant = "pane", onSelect }) {
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return threads ?? [];
    return (threads ?? []).filter((thread) => {
      const profileText = `${thread.profile?.display_name || ""} ${thread.profile?.username || ""}`.toLowerCase();
      return profileText.includes(needle) || String(thread.lastMessage?.body || "").toLowerCase().includes(needle);
    });
  }, [threads, search]);

  const unreadTotal = (threads ?? []).reduce((sum, t) => sum + (t.unread > 0 ? 1 : 0), 0);

  return (
    <div className={`${styles.list} ${variant === "dock" ? styles.listDock : ""}`}>
      <div className={styles.head}>
        {variant !== "dock" && (
          <h1 className={styles.title}>
            Inbox
            {unreadTotal > 0 && <span className={styles.unreadCount} aria-label={`${unreadTotal} unread conversations`}>{unreadTotal}</span>}
          </h1>
        )}
        <button type="button" className={styles.newButton} onClick={() => setPickerOpen(true)} aria-label="New message" title="New message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <span>New</span>
        </button>
      </div>

      {(threads?.length ?? 0) > 0 && (
        <input
          type="search"
          className={styles.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
        />
      )}

      <div className={styles.scroll}>
        {threads === null ? (
          <ul className={styles.rows} aria-busy="true" aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => <li key={i} className={`${styles.row} ${styles.rowSkeleton}`}><span /><span /></li>)}
          </ul>
        ) : error ? (
          <div className="auth-error"><p>{error}</p></div>
        ) : threads.length === 0 ? (
          <EmptyState
            title="No messages yet"
            body="When another collector messages you, the conversation will show up here. You can also start one from any profile."
          />
        ) : (
          <ul className={styles.rows}>
            {filtered.map((t) => {
              const username = t.profile?.username || "unknown";
              const name = t.profile?.display_name || t.profile?.username || "Unknown user";
              // Order notes are written by the site, not by either collector.
              const preview = `${t.lastMessage.is_system ? "ComixCatalog: " : ""}${t.lastMessage.body || ""}`.slice(0, 110);
              const isUnread = t.unread > 0;
              const isActive = activeUsername && username === activeUsername;
              const className = [styles.row, isUnread ? styles.rowUnread : "", isActive ? styles.rowActive : ""].filter(Boolean).join(" ");
              const inner = (
                <>
                  <span className={styles.avatar}><Avatar profile={t.profile || { id: t.otherId, username }} /></span>
                  <span className={styles.body}>
                    <span className={styles.top}>
                      <strong>{name}</strong>
                      <span className={styles.time}>{formatTimeAgo(t.lastMessage.created_at)}</span>
                    </span>
                    <span className={styles.preview}>{preview || <em>(empty)</em>}</span>
                  </span>
                  {isUnread && <span className={styles.dot} aria-label={`${t.unread} unread`} />}
                </>
              );
              return (
                <li key={t.otherId}>
                  {onSelect ? (
                    <button type="button" className={className} onClick={() => onSelect(username)}>{inner}</button>
                  ) : (
                    <Link href={`/inbox/${username}`} className={className} aria-current={isActive ? "page" : undefined}>{inner}</Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {threads?.length > 0 && filtered.length === 0 && <p className={styles.noMatch}>No conversations match that search.</p>}
      </div>

      {pickerOpen && <NewMessagePicker onClose={() => setPickerOpen(false)} onPick={onSelect} />}
    </div>
  );
}
