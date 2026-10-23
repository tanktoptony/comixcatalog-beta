"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/Badge";
import { BADGES_BY_ID, BADGE_CATALOG } from "@/lib/badges/catalog";

export default function BadgeToast() {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    const receive = (event) => setIds((current) => [...current, ...(event.detail ?? [])]);
    window.addEventListener("cc:badges-earned", receive);
    return () => window.removeEventListener("cc:badges-earned", receive);
  }, []);
  useEffect(() => {
    if (!ids.length) return;
    const timeout = setTimeout(() => setIds((current) => current.slice(1)), 6000);
    return () => clearTimeout(timeout);
  }, [ids]);
  const badge = BADGES_BY_ID.get(ids[0]);
  if (!badge) return null;
  const index = BADGE_CATALOG.findIndex((item) => item.id === badge.id);
  const next = BADGE_CATALOG.slice(index + 1).find((item) => item.group === badge.group);
  return (
    <aside className="badge-toast" role="status" aria-live="polite">
      <Badge badge={badge} size={64} showText={false} />
      <div><em>Badge earned</em><strong>{badge.name}</strong><span>{badge.description}{next ? `. Next up: ${next.name}.` : ""}</span></div>
      <button type="button" aria-label="Dismiss badge notification" onClick={() => setIds((current) => current.slice(1))}>×</button>
    </aside>
  );
}
