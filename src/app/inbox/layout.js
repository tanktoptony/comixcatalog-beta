"use client";

// Two-pane inbox, Messenger style. The conversation list lives here so it
// stays mounted (and keeps its scroll and search) while you switch
// conversations; the page renders the right pane:
//   /inbox            -> activity strips + "Pick a conversation"
//   /inbox/<username> -> that conversation
// Desktop (>= 900px) shows both panes side by side. Phones show the list at
// /inbox and only the conversation at /inbox/<username>.

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { InboxDataContext, useInboxThreads } from "@/hooks/useInboxThreads";
import ThreadList from "@/components/inbox/ThreadList";
import styles from "./inbox.module.css";

function activeUsernameFrom(pathname) {
  const match = /^\/inbox\/([^/]+)/.exec(pathname || "");
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

export default function InboxLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const data = useInboxThreads(user, { notifications: true });
  const activeUsername = activeUsernameFrom(pathname);
  const shellRef = useRef(null);

  // Signed out: log in and come back here.
  useEffect(() => {
    if (!user && !authLoading) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [user, authLoading, router]);

  // Fill the viewport below the site header (its height changes with the
  // founding banner and on phones), so only the list and the messages scroll.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const fit = () => {
      const top = shell.getBoundingClientRect().top + window.scrollY;
      shell.style.setProperty("--inbox-top", `${Math.max(0, Math.round(top))}px`);
    };
    fit();
    // The founding banner and header can change height after first paint
    // (it pushed the composer below the fold in testing), so re-measure
    // whenever the page resizes. The banner can mount after us, so watch the
    // body rather than elements that exist now; re-measuring is idempotent.
    const observer = new ResizeObserver(fit);
    observer.observe(document.body);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  return (
    <InboxDataContext.Provider value={data}>
      <section ref={shellRef} className={styles.shell} data-view={activeUsername ? "thread" : "list"}>
        <aside className={styles.listPane} aria-label="Conversations">
          <ThreadList threads={data.threads} error={data.error} activeUsername={activeUsername} />
        </aside>
        <div className={styles.mainPane}>{children}</div>
      </section>
    </InboxDataContext.Provider>
  );
}
