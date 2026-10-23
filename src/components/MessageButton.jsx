"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function MessageButton({ recipientUsername, recipientId, compact = false }) {
  const { user, loading } = useAuth();
  if (loading || !user || !recipientUsername || user.id === recipientId) return null;
  return (
    <Link
      href={`/inbox/${encodeURIComponent(recipientUsername)}`}
      className={`profile-action-btn message-button${compact ? " is-compact" : ""}`}
    >
      Message
    </Link>
  );
}
