"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "./EmptyState";

const VIEW_STORAGE_KEY = "cc:profile-view";

// Compress an array of issue-number strings into ranges like "#1, #3, #5-9".
function formatIssueRanges(issues) {
  const nums = [];
  const nonNum = [];
  for (const i of issues) {
    const v = issueSortValue(i);
    if (v === Number.MAX_SAFE_INTEGER) nonNum.push(String(i));
    else nums.push(v);
  }
  nums.sort((a, b) => a - b);
  const ranges = [];
  let start = null, prev = null;
  for (const n of nums) {
    if (start === null) { start = n; prev = n; continue; }
    if (n === prev + 1) { prev = n; continue; }
    ranges.push(start === prev ? `#${start}` : `#${start}-${prev}`);
    start = n; prev = n;
  }
  if (start !== null) ranges.push(start === prev ? `#${start}` : `#${start}-${prev}`);
  return [...ranges, ...nonNum.map(s => `#${s}`)].join(", ");
}

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

// Issue-number sort key — extracts the leading numeric component so dual-
// numbered issues ("30 (471)" — X-Men v2 legacy), "1A" / "1.MU" / "300.1"
// variants sort by their primary number rather than getting shoved to the
// end as NaN. Mirrors /series/[id]/page.js's logic.
function issueSortValue(issueNumber) {
  const raw = String(issueNumber ?? "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const num = Number(raw);
  if (!Number.isNaN(num)) return num;
  const match = raw.match(/^(-?\d+(\.\d+)?)/);
  if (match) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

const SORT_OPTIONS = [
  { value: "issue-asc",   label: "Issue # ascending" },
  { value: "issue-desc",  label: "Issue # descending" },
  { value: "title-asc",   label: "Title A–Z" },
  { value: "title-desc",  label: "Title Z–A" },
  { value: "year-asc",    label: "Year ascending" },
  { value: "year-desc",   label: "Year descending" },
  { value: "added-desc",  label: "Recently added" },
  { value: "added-asc",   label: "Oldest added" },
];

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
  // Default: title A–Z. Collectors typically want to scan a shelf by series.
  const [sortMode, setSortMode] = useState("title-asc");
  // View mode: "grid" (cards) or "rows" (one row per series, expand to see issues).
  // Default to rows on narrow viewports; persists in localStorage.
  const [viewMode, setViewMode] = useState("grid");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "rows") {
        setViewMode(stored);
        return;
      }
    } catch {}
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
      setViewMode("rows");
    }
  }, []);
  const updateViewMode = (next) => {
    setViewMode(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch {}
  };

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

  const rawActiveItems =
    activeTab === "owned"
      ? grouped.owned
      : activeTab === "wishlist"
      ? grouped.wishlist
      : activeTab === "for_sale"
      ? grouped.forSale
      : [];

  // Sort. We sort against display.* (resolved title/year/issue) so the order
  // matches what the user actually sees on the cards, not the raw row data.
  const activeItems = useMemo(() => {
    if (activeTab === "activity") return rawActiveItems;
    const items = [...rawActiveItems];
    const safeTitle = (i) => String(i.display?.title ?? "").toLowerCase();
    const safeIssue = (i) => issueSortValue(i.display?.issueNumber);
    const safeYear = (i) => Number(i.display?.year ?? 0);
    const safeAdded = (i) => i.created_at ?? "";
    switch (sortMode) {
      case "issue-asc":
        items.sort((a, b) => {
          const t = safeTitle(a).localeCompare(safeTitle(b));
          return t !== 0 ? t : safeIssue(a) - safeIssue(b);
        });
        break;
      case "issue-desc":
        items.sort((a, b) => {
          const t = safeTitle(a).localeCompare(safeTitle(b));
          return t !== 0 ? t : safeIssue(b) - safeIssue(a);
        });
        break;
      case "title-asc":
        items.sort((a, b) => {
          const t = safeTitle(a).localeCompare(safeTitle(b));
          return t !== 0 ? t : safeIssue(a) - safeIssue(b);
        });
        break;
      case "title-desc":
        items.sort((a, b) => {
          const t = safeTitle(b).localeCompare(safeTitle(a));
          return t !== 0 ? t : safeIssue(a) - safeIssue(b);
        });
        break;
      case "year-asc":
        items.sort((a, b) => safeYear(a) - safeYear(b));
        break;
      case "year-desc":
        items.sort((a, b) => safeYear(b) - safeYear(a));
        break;
      case "added-desc":
        items.sort((a, b) => String(safeAdded(b)).localeCompare(String(safeAdded(a))));
        break;
      case "added-asc":
        items.sort((a, b) => String(safeAdded(a)).localeCompare(String(safeAdded(b))));
        break;
    }
    return items;
  }, [rawActiveItems, sortMode, activeTab]);

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
        {activeTab !== "activity" && activeItems.length > 0 && (
          <div className="profile-toolbar">
            <div className="profile-view-toggle" role="group" aria-label="View">
              <button
                type="button"
                className={`profile-view-btn ${viewMode === "grid" ? "is-active" : ""}`}
                onClick={() => updateViewMode("grid")}
                aria-pressed={viewMode === "grid"}
              >
                Grid
              </button>
              <button
                type="button"
                className={`profile-view-btn ${viewMode === "rows" ? "is-active" : ""}`}
                onClick={() => updateViewMode("rows")}
                aria-pressed={viewMode === "rows"}
              >
                Rows
              </button>
            </div>
            <div className="profile-sort-wrap">
              <label htmlFor="profile-sort" className="profile-sort-label">Sort</label>
              <select
                id="profile-sort"
                className="profile-sort-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {activeTab === "activity" ? (
          <ActivityList items={collection.slice(0, 20)} />
        ) : activeItems.length === 0 ? (
          <EmptyTab tab={activeTab} isOwner={isOwner} />
        ) : viewMode === "rows" ? (
          <SeriesRowsView items={activeItems} activeTab={activeTab} />
        ) : (
          <div className="comic-grid">
            {activeItems.map((item) => {
              const d = item.display;
              if (!d) return null;
              // Context-aware cover selection:
              //   For Sale tab → personal first (buyer wants to see the actual
              //                  copy, slab, condition — not a stock cover).
              //   Owned/Wantlist  → canonical first (catalog display posture);
              //                  personal surfaces as a small overlay badge.
              // Falls through to community then placeholder when canonical is
              // absent (long-tail series we haven't ingested yet).
              const isForSale = activeTab === "for_sale";
              const coverUrl = isForSale
                ? d.personalCoverUrl || d.canonicalCoverUrl || d.communityCoverUrl || d.coverUrl || "/fallback-cover.png"
                : d.canonicalCoverUrl || d.communityCoverUrl || d.personalCoverUrl || d.coverUrl || "/fallback-cover.png";
              const showOwnerPhotoTag =
                !isForSale && d.personalCoverUrl && coverUrl !== d.personalCoverUrl;
              const value =
                item.market_value != null && Number(item.market_value) > 0
                  ? Number(item.market_value)
                  : null;

              return (
                <Link key={item.id} href={d.href} className="comic-card">
                  <div className="comic-card-cover" style={{ position: "relative" }}>
                    <img src={coverUrl} alt={d.title} />
                    {item.slab_company && item.grade_numeric ? (
                      <span className="profile-grade-badge">
                        {item.slab_company} {Number(item.grade_numeric).toFixed(1)}
                      </span>
                    ) : null}
                    {showOwnerPhotoTag && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 6,
                          left: 6,
                          padding: "2px 6px",
                          borderRadius: 6,
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          background: "rgba(0,0,0,0.55)",
                          color: "rgba(255,255,255,0.8)",
                          letterSpacing: "0.04em",
                        }}
                        title="Owner has uploaded a photo of their copy"
                      >
                        OWNER HAS PHOTO
                      </span>
                    )}
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

function SeriesRowsView({ items, activeTab }) {
  // Group by series (title + year as disambiguator for multi-volume runs).
  // We use display.title because that's already the resolved series title
  // (not the issue title), matching how cards label themselves.
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const d = item.display;
      if (!d) continue;
      const title = d.title || "Untitled";
      // Group by series title alone — different volumes of "Fantastic Four"
      // (1961, 1998, 2022) all collapse into a single row. Collectors think
      // of these as the same shelf; multi-volume splitting fragmented the
      // list past the point of usefulness.
      const key = title;
      let g = map.get(key);
      if (!g) {
        g = { key, title, years: new Set(), items: [], cover: null };
        map.set(key, g);
      }
      if (d.year) g.years.add(Number(d.year));
      g.items.push(item);
      if (!g.cover) {
        g.cover = d.canonicalCoverUrl || d.communityCoverUrl || d.coverUrl || null;
      }
    }
    // Materialize year display: single year if items all share one, otherwise
    // "min-max" range.
    return [...map.values()].map((g) => {
      const years = [...g.years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
      g.year = years.length === 0 ? "" : years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`;
      return g;
    }).sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);

  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const isForSale = activeTab === "for_sale";

  return (
    <ul className="series-rows">
      {groups.map((g) => {
        const open = expanded.has(g.key);
        const issueNums = g.items.map((it) => it.display?.issueNumber).filter(Boolean);
        const summary = issueNums.length
          ? formatIssueRanges(issueNums)
          : `${g.items.length} item${g.items.length === 1 ? "" : "s"}`;
        const totalValue = g.items.reduce((sum, it) => {
          const v = Number(it.market_value);
          return Number.isFinite(v) && v > 0 ? sum + v : sum;
        }, 0);

        return (
          <li key={g.key} className={`series-row ${open ? "is-open" : ""}`}>
            <button
              type="button"
              className="series-row-head"
              onClick={() => toggle(g.key)}
              aria-expanded={open}
            >
              <div className="series-row-thumb">
                {g.cover ? (
                  <img src={g.cover} alt="" loading="lazy" />
                ) : (
                  <div className="series-row-thumb-empty" />
                )}
              </div>
              <div className="series-row-body">
                <div className="series-row-title">
                  {g.title}
                  {g.year ? <span className="series-row-year"> ({g.year})</span> : null}
                </div>
                <div className="series-row-meta">
                  <span className="series-row-count">{g.items.length} issue{g.items.length === 1 ? "" : "s"}</span>
                  <span className="series-row-dot">·</span>
                  <span className="series-row-summary">{summary}</span>
                  {totalValue > 0 && (
                    <>
                      <span className="series-row-dot">·</span>
                      <span className="series-row-value">${totalValue.toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="series-row-chevron" aria-hidden>
                {open ? "▾" : "▸"}
              </span>
            </button>
            {open && (
              <div className="comic-grid series-row-grid">
                {g.items.map((item) => {
                  const d = item.display;
                  if (!d) return null;
                  const coverUrl = isForSale
                    ? d.personalCoverUrl || d.canonicalCoverUrl || d.communityCoverUrl || d.coverUrl || "/fallback-cover.png"
                    : d.canonicalCoverUrl || d.communityCoverUrl || d.personalCoverUrl || d.coverUrl || "/fallback-cover.png";
                  const value =
                    item.market_value != null && Number(item.market_value) > 0
                      ? Number(item.market_value)
                      : null;
                  return (
                    <Link key={item.id} href={d.href} className="comic-card">
                      <div className="comic-card-cover" style={{ position: "relative" }}>
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
          </li>
        );
      })}
    </ul>
  );
}

function EmptyTab({ tab, isOwner }) {
  if (tab === "owned") {
    return (
      <EmptyState
        icon="📚"
        compact
        title={isOwner ? "Nothing in your collection yet" : "No public collection"}
        body={
          isOwner
            ? "Add issues you own to start tracking grades, values, and variants."
            : "This collector hasn't added owned books to their public profile yet."
        }
        ctaHref={isOwner ? "/search" : null}
        ctaLabel={isOwner ? "Find comics to add" : null}
      />
    );
  }
  if (tab === "wishlist") {
    return (
      <EmptyState
        icon="🎯"
        compact
        title={isOwner ? "Your wantlist is empty" : "No public wantlist"}
        body={
          isOwner
            ? "Track issues you're hunting for. Sellers can see your public wantlist and reach out."
            : "This collector hasn't shared a wantlist."
        }
        ctaHref={isOwner ? "/search" : null}
        ctaLabel={isOwner ? "Find issues to track" : null}
      />
    );
  }
  // for_sale
  return (
    <EmptyState
      icon="🏷️"
      compact
      title={isOwner ? "Nothing listed for sale" : "Nothing for sale"}
      body={
        isOwner
          ? "List slabbed or graded copies once the marketplace launches in Phase 2."
          : "This collector isn't selling anything at the moment."
      }
    />
  );
}

function ActivityList({ items }) {
  if (!items.length) {
    return (
      <EmptyState
        icon="🕒"
        compact
        title="No activity yet"
        body="Adds, grade edits, and listings will show up here as you use ComixCatalog."
      />
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
