"use client";

// /inbox/<username>: the right side of the two-pane inbox (the list stays
// mounted in src/app/inbox/layout.js). The conversation itself lives in
// src/components/inbox/ThreadView.js so the chat dock can reuse it.

import { useParams } from "next/navigation";
import ThreadView from "@/components/inbox/ThreadView";

export default function ThreadPage() {
  const { username } = useParams();
  return <ThreadView username={username} variant="pane" />;
}
