"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const TAB_DEFS = [
  { id: "owned", label: "Owned", visibilityKey: "collection" },
  { id: "wishlist", label: "Wantlist", visibilityKey: "wantlist" },
  { id: "for_sale", label: "For Sale", visibilityKey: "for_sale" },
  { id: "activity", label: "Activity", visibilityKey: null },
];

function formatRelative(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ActivityVerb({ status }) {
  if (status === "owned") return "added to collection";
  if (status === "wishlist") return "added to wantlist";
  if (status === "for_sale") return "listed for sale";
  return "updated";
}

export default function ProfileTabs({ collection, isOwner, visibility = {} }) {
  // Filter out tabs whose section is hidden by privacy settings (unless owner).
  const visibleTabs = TAB_DEFS.filter((t) => {
    if (!t.visibilityKey) return true;
    if (isOwner) return true;
    return visibility[t.visibilityKey] !== false;
  });

  const [activeTab, setActiveTab] = useState(
    visibleTabs[0]?.id || "owned"
  );

  const grouped = useMemo(() => {
    const owned = [];
    const wishlist = [];
    const forSale = [];
    for (const item of collection) {
      if (item.status === "owned") owned.push(item);
      else if (item.status === "wishlist") wishlist.push(item);
      else if (item.status === "for_sale") forSale.push(item);
    }
    return { owned, wishlist, forSale };
  }, [collection]);

  const counts = {
    owned: grouped.owned.length,
    wishlist: grouped.wishlist.length,
    for_sale: grouped.forSale.length,
    activity: collection.length,
  };

  const activeItems =
    activeTab === "owned"
      ? grouped.owned
      : activeTab === "wishlist"
      ? grouped.wishlist
      : activeTab === "for_sale"
      ? grouped.forSale
      : [];

  return (
    <div className="profile-tabs-wrap">
      <div className="profile-tabs" role="tablist">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`profile-tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="profile-tab-label">{tab.label}</span>
            <span className="profile-tab-count">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="profile-tab-panel">
        {activeTab === "activity" ? (
          <ActivityList items={collection.slice(0, 20)} />
        ) : activeItems.length === 0 ? (
          <EmptyTab tab={activeTab} isOwner={isOwner} />
        ) : (
          <div className="comic-grid">
            {activeItems.map((item) => {
              const d = item.display;
              if (!d) return null;
              const coverUrl = d.coverUrl || "/fallback-cover.png";
              const value =
                item.market_value != null && Number(item.market_value) > 0
                  ? Number(item.market_value)
                  : null;

              return (
                <Link key={item.id} href={d.href} className="comic-card">
                  <div className="comic-card-cover">
                    <img src={coverUrl} alt={d.title} />
                    {item.slab_company && item.grade_numeric ? (
                      <span className="profile-grade-badge">
                        {item.slab_company} {Number(item.grade_numeric).toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <div className="comic-card-title">
                    {d.title}
                    {d.issueNumber ? ` #${d.issueNumber}` : ""}
                  </div>
                  <div className="comic-card-meta">
                    {d.year || "Unknown"}
                    {value != null ? (
                      <span className="profile-card-value">
                        {" · "}${value.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyTab({ tab, isOwner }) {
  const copy =
    tab === "owned"
      ? isOwner
        ? "You don't have any books in your collection yet."
        : "This collector hasn't added any owned books yet."
      : tab === "wishlist"
      ? isOwner
        ? "Your wantlist is empty. Add issues you're hunting for."
        : "No public wantlist."
      : isOwner
      ? "You haven't listed anything for sale."
      : "Nothing for sale right now.";

  return (
    <div className="profile-tab-empty">
      <p>{copy}</p>
      {isOwner && (
        <Link href="/search" className="primary-btn">
          Find comics
        </Link>
      )}
    </div>
  );
}

function ActivityList({ items }) {
  if (!items.length) {
    return (
      <div className="profile-tab-empty">
        <p>No activity yet.</p>
      </div>
    );
  }

  return (
    <ul className="profile-activity-list">
      {items.map((item) => {
        const d = item.display;
        if (!d) return null;
        const cover = d.coverUrl || "/fallback-cover.png";
        return (
          <li key={item.id} className="profile-activity-item">
            <Link href={d.href} className="profile-activity-link">
              <img className="profile-activity-cover" src={cover} alt="" />
              <div className="profile-activity-body">
                <div className="profile-activity-line">
                  <ActivityVerb status={item.status} />{" "}
                  <span className="profile-activity-title">
                    {d.title}
                    {d.issueNumber ? ` #${d.issueNumber}` : ""}
                  </span>
                </div>
                <div className="profile-activity-meta">
                  {formatRelative(item.created_at)}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
