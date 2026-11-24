"use client";

import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/Badge";
import { authedFetch } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import { BADGE_CATALOG, SECRET_BADGE_COUNT, badgeForDisplay } from "@/lib/badges/catalog";
import { isRare, rarityLabel } from "@/lib/badges/rarity";

// rarity: { total, counts } from loadBadgeRarity(), plain data.
export default function BadgeGallery({ groups, profileId, showcase = [], foundingNumber, rarity = null }) {
  const { user } = useAuth();
  const isOwner = user?.id === profileId;
  const [selected, setSelected] = useState(showcase);
  const [message, setMessage] = useState("");
  const [ownerProgress, setOwnerProgress] = useState(null);
  useEffect(() => {
    if (!isOwner) return;
    authedFetch("/api/badges/sync", { method: "POST" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (response.ok) setOwnerProgress(body);
    });
  }, [isOwner]);
  const displayGroups = useMemo(() => {
    if (!isOwner || !ownerProgress) return groups;
    const map = new Map();
    for (const badge of BADGE_CATALOG) {
      if (!map.has(badge.group)) map.set(badge.group, []);
      const earned = ownerProgress.earned.includes(badge.id);
      map.get(badge.group).push({ badge: badgeForDisplay(badge, { earned }), earned, progress: ownerProgress.progress[badge.id] });
    }
    return [...map.entries()];
  }, [groups, isOwner, ownerProgress]);
  // The counts are cached for ten minutes, so a badge earned just now still
  // counts its holder.
  const rarityFor = (id, earned) => {
    if (!rarity?.total) return null;
    const count = Math.max(rarity.counts?.[id] ?? 0, earned ? 1 : 0);
    return { label: rarityLabel(count, rarity.total), rare: isRare(count, rarity.total) };
  };
  const secretsFound = displayGroups.find(([name]) => name === "Secret")?.[1].filter((entry) => entry.earned).length ?? 0;
  async function toggle(id) {
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id].slice(-4);
    setSelected(next);
    const response = await authedFetch("/api/badges/showcase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ badges: next }) });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Showcase saved" : body.error ?? "Could not save showcase");
  }
  return (
    <>
      {isOwner && <p className="badges-help">Choose up to four earned badges for your profile.</p>}
      {rarity?.total > 0 && <p className="badges-help">The percentage under each badge is the share of all {rarity.total} collectors on Comix Catalog who have earned it.</p>}
      {message && <p className="badges-message" role="status">{message}</p>}
      {displayGroups.map(([name, badges]) => (
        <section className="badges-group" key={name}>
          <h2>{name}</h2>
          {name === "Secret" && <p className="badges-secret-count">{isOwner && ownerProgress ? `${secretsFound} of ${SECRET_BADGE_COUNT} found. Each one stays hidden until you earn it.` : `${secretsFound} of ${SECRET_BADGE_COUNT} secret badges found.`}</p>}
          <div className="badges-grid">
            {badges.map(({ badge, earned, progress }) => (
              <div key={badge.id} className="badge-choice">
                <Badge badge={badge} earned={earned} progress={progress} foundingNumber={foundingNumber} rarity={rarityFor(badge.id, earned)} />
                {isOwner && earned && <button type="button" className={selected.includes(badge.id) ? "is-selected" : ""} onClick={() => toggle(badge.id)}>{selected.includes(badge.id) ? "Pinned" : "Pin to profile"}</button>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
