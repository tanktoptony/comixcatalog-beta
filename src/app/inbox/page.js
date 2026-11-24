"use client";

// /inbox: the right pane before a conversation is picked (desktop), or the
// strips above the list (phones). The list itself is in ./layout.js.

import { useState } from "react";
import { useInboxData } from "@/hooks/useInboxThreads";
import InboxStrips from "@/components/inbox/InboxStrips";
import NewMessagePicker from "@/components/inbox/NewMessagePicker";
import styles from "./inbox.module.css";

export default function InboxPage() {
  const data = useInboxData();
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasStrips = Boolean(data?.activity?.length || data?.newFollowers?.length || data?.pendingPurchases?.length);

  return (
    <div className={styles.landing}>
      {hasStrips && (
        <div className={styles.strips}>
          <InboxStrips activity={data.activity} newFollowers={data.newFollowers} pendingPurchases={data.pendingPurchases} />
        </div>
      )}
      <div className={styles.pick}>
        <div className={styles.pickGlyph} aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2>Pick a conversation</h2>
        <p>Choose someone on the left, or start something new with another collector.</p>
        <button type="button" className={styles.pickButton} onClick={() => setPickerOpen(true)}>New message</button>
      </div>
      {pickerOpen && <NewMessagePicker onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
