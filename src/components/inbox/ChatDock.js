"use client";

// The inbox in a popup, on any page: the header's inbox button opens it
// (src/lib/chatDock.js). Desktop: a panel docked bottom-right, so you can
// reply and keep browsing. Phones: a full-screen sheet over the page; closing
// it puts you back where you were. Reuses the inbox's list and conversation
// components in their "dock" variant. Hidden on /inbox, which already shows
// both. Where you were (open, which conversation) survives page changes and
// reloads in this tab.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useInboxThreads } from "@/hooks/useInboxThreads";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { OPEN_CHAT_DOCK_EVENT } from "@/lib/chatDock";
import ThreadList from "@/components/inbox/ThreadList";
import ThreadView from "@/components/inbox/ThreadView";
import styles from "./ChatDock.module.css";

const STORAGE_KEY = "cc:chat-dock";

function readSaved() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    return saved && typeof saved === "object" ? saved : null;
  } catch {
    return null;
  }
}

function save(state) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

// Mounted only while the dock shows the list, so closed docks don't poll.
function DockList({ user, onSelect }) {
  const { threads, error } = useInboxThreads(user);
  return <ThreadList threads={threads} error={error} variant="dock" onSelect={onSelect} />;
}

export default function ChatDock() {
  const { user } = useAuth();
  const pathname = usePathname();
  const unread = useUnreadMessageCount();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(null);
  const panelRef = useRef(null);
  const onInbox = /^\/inbox(\/|$)/.test(pathname || "");

  // Restore after a reload.
  useEffect(() => {
    const saved = readSaved();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved?.open) { setOpen(true); setUsername(saved.username ?? null); }
  }, []);

  useEffect(() => { save({ open, username }); }, [open, username]);

  useEffect(() => {
    const onOpen = (event) => {
      setOpen(true);
      setUsername(event.detail?.username ?? null);
    };
    window.addEventListener(OPEN_CHAT_DOCK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT_DOCK_EVENT, onOpen);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const visible = Boolean(open && user && !onInbox);

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event) => {
      // Escape closes the emoji picker first; that one stops here.
      if (event.key === "Escape" && !document.querySelector("[role='dialog'][aria-label*='emoji' i], [role='dialog'][aria-label='React to message']")) close();
    };
    document.addEventListener("keydown", onKey);
    // Phones: the sheet covers the page, so the page shouldn't scroll under it.
    const phone = window.matchMedia("(max-width: 640px)").matches;
    const previous = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (phone) document.body.style.overflow = previous;
    };
  }, [visible, close]);

  if (!visible) return null;

  const activity = Math.max(0, Number(unread.notifications) || 0) + Math.max(0, Number(unread.followers) || 0) + Math.max(0, Number(unread.purchases) || 0);

  return (
    <section ref={panelRef} tabIndex={-1} className={styles.dock} role="dialog" aria-label="Messages" aria-modal="false">
      <header className={styles.bar}>
        <strong className={styles.title}>Messages</strong>
        {activity > 0 && (
          <Link href="/inbox" className={styles.activity} onClick={close}>
            {activity} new in inbox
          </Link>
        )}
        <Link
          href={username ? `/inbox/${encodeURIComponent(username)}` : "/inbox"}
          className={styles.iconButton}
          onClick={close}
          aria-label="Open full inbox"
          title="Open full inbox"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
          </svg>
        </Link>
        <button type="button" className={styles.iconButton} onClick={close} aria-label="Close messages" title="Close (Esc)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18" /><path d="M6 6l12 12" />
          </svg>
        </button>
      </header>
      <div className={styles.body}>
        {username ? (
          <Suspense fallback={null}>
            <ThreadView key={username} username={username} variant="dock" onBack={() => setUsername(null)} />
          </Suspense>
        ) : (
          <DockList user={user} onSelect={setUsername} />
        )}
      </div>
    </section>
  );
}
