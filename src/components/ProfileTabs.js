"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmptyState from "./EmptyState";
import { coverThumb } from "@/lib/coverThumb";
import { useAuth } from "@/context/AuthContext";
import { issueNumberSuffix } from "@/lib/issueNumberLabel";
import { authedFetch } from "@/lib/apiClient";

const VIEW_STORAGE_KEY = "cc:profile-view";
const INITIAL_GRID_ITEMS = 60;

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

export default function ProfileTabs({ collection, summary = {}, initialPage, isOwner, visibility = {}, profileUsername }) {
  const { user } = useAuth();
  // Filter out tabs whose section is hidden by privacy settings (unless owner).
  const visibleTabs = TAB_DEFS.filter((t) => {
    if (!t.visibilityKey) return true;
    if (isOwner) return true;
    return visibility[t.visibilityKey] !== false;
  });

  const [activeTab, setActiveTab] = useState(initialPage?.tab || visibleTabs[0]?.id || "owned");
  // Default: title A–Z. Collectors typically want to scan a shelf by series.
  const [sortMode, setSortMode] = useState(initialPage?.sort || "title-asc");
  const [tradeOnly, setTradeOnly] = useState(false);
  const [items, setItems] = useState(collection);
  const [page, setPage] = useState(initialPage ?? { total: collection.length, hasMore: false });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [publisher, setPublisher] = useState("");
  const [decade, setDecade] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const sentinelRef = useRef(null);
  const firstRequest = useRef(true);
  const retryRequest = useRef({ offset: 0, append: false });
  // View mode: "grid" (cards) or "rows" (one row per series, expand to see issues).
  // Default to rows on narrow viewports; persists in localStorage.
  const [viewMode, setViewMode] = useState("grid");
  useEffect(() => {
    // Reading localStorage/matchMedia can only happen after mount (SSR has
    // neither), so this legitimately needs to setState from inside an
    // effect rather than a lazy useState initializer — same pattern already
    // suppressed the same way in src/app/library/page.js's view-mode effect.
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "rows") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setSearchPending(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const requestPage = useCallback(async (offset, append = false) => {
    if (activeTab === "activity") return;
    retryRequest.current = { offset, append };
    const currentRequest = ++requestNumber.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      username: profileUsername,
      tab: activeTab,
      sort: sortMode,
      offset: String(offset),
      limit: String(INITIAL_GRID_ITEMS),
    });
    if (search) params.set("q", search);
    if (publisher) params.set("publisher", publisher);
    if (decade) params.set("decade", decade);
    if (tradeOnly && activeTab === "owned") params.set("trade", "1");
    try {
      const response = await authedFetch(`/api/public-profile?${params.toString()}`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.collection || !body?.page) throw new Error(body?.error || "Could not load this shelf.");
      if (currentRequest !== requestNumber.current) return;
      setItems((current) => append
        ? [...new Map([...current, ...body.collection].map((item) => [item.id, item])).values()]
        : body.collection);
      setPage(body.page);
    } catch (requestError) {
      if (currentRequest !== requestNumber.current) return;
      setError(requestError?.message || "Could not load this shelf.");
    } finally {
      if (currentRequest === requestNumber.current) setLoading(false);
    }
  }, [activeTab, decade, profileUsername, publisher, search, sortMode, tradeOnly]);

  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      return;
    }
    // The query controls changed, so replace the visible server page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTab !== "activity") requestPage(0, false);
  }, [activeTab, requestPage]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !page?.hasMore || loading || error) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) requestPage(items.length, true);
    }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, items.length, loading, page?.hasMore, requestPage]);

  const grouped = useMemo(() => {
    const owned = [];
    const wishlist = [];
    const forSale = [];
    for (const item of items) {
      // A book listed for sale is still a book you own, so it stays on the
      // Owned shelf too (the Owned stat counts it); For Sale is the subset.
      if (item.status === "owned") owned.push(item);
      else if (item.status === "wishlist") wishlist.push(item);
      else if (item.status === "for_sale") { owned.push(item); forSale.push(item); }
    }
    return { owned, wishlist, forSale };
  }, [items]);

  const counts = {
    owned: summary.counts?.owned ?? grouped.owned.length,
    wishlist: summary.counts?.wishlist ?? grouped.wishlist.length,
    for_sale: summary.counts?.for_sale ?? grouped.forSale.length,
    activity: summary.counts?.activity ?? items.length,
  };

  const tradeCount = summary.tradeCount ?? grouped.owned.filter((item) => item.open_to_trade).length;
  const rawActiveItems = activeTab === "owned" && tradeOnly && tradeCount > 0
    ? items.filter((item) => item.open_to_trade)
    : items;

  const activeItems = rawActiveItems;

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
            onClick={() => {
              setActiveTab(tab.id);
            }}
          >
            <span className="profile-tab-label">{tab.label}</span>
            <span className="profile-tab-count">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="profile-tab-panel">
        {activeTab !== "activity" && counts[activeTab] > 0 && (
          <div className="profile-toolbar">
            {activeTab === "owned" && tradeCount > 0 && <button type="button" className={`profile-trade-chip${tradeOnly ? " is-active" : ""}`} aria-pressed={tradeOnly} onClick={() => setTradeOnly((value) => !value)}>Open to trade ({tradeCount})</button>}
            <input
              className="profile-filter-input"
              type="search"
              value={searchInput}
              placeholder="Search this collection"
              aria-label="Search this collection"
              onChange={(event) => {
                setSearchPending(true);
                setSearchInput(event.target.value);
              }}
            />
            <select className="profile-sort-select" value={publisher} aria-label="Filter by publisher" onChange={(event) => setPublisher(event.target.value)}>
              <option value="">All publishers</option>
              {(summary.facets?.publishers ?? []).map((facet) => <option key={facet.value} value={facet.value}>{facet.value} ({facet.count})</option>)}
            </select>
            <select className="profile-sort-select" value={decade} aria-label="Filter by decade" onChange={(event) => setDecade(event.target.value)}>
              <option value="">All decades</option>
              {(summary.facets?.decades ?? []).map((facet) => <option key={facet.value} value={facet.value}>{facet.value}s ({facet.count})</option>)}
            </select>
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
                onChange={(e) => {
                  setSortMode(e.target.value);
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {(loading || searchPending) && <span className="profile-page-status" role="status">Loading books...</span>}
          </div>
        )}
        {error && (
          <div className="profile-page-error" role="alert">
            <span>{error}</span>
            <button type="button" className="primary-btn" onClick={() => requestPage(retryRequest.current.offset, retryRequest.current.append)}>Retry</button>
          </div>
        )}
        {activeTab === "activity" ? (
          <ActivityList items={summary.activity ?? collection.slice(0, 20)} />
        ) : activeItems.length === 0 ? (
          <EmptyTab tab={activeTab} isOwner={isOwner} />
        ) : viewMode === "rows" ? (
          <SeriesRowsView items={activeItems} activeTab={activeTab} askAbout={!isOwner && user ? profileUsername : null} />
        ) : (
          <div className={`comic-grid${activeTab === "owned" ? " comic-grid--wall" : ""}`}>
            {activeItems.map((item) => {
              const d = item.display;
              if (!d) return null;
              // "The Case" is a showcase, not a management view — the owned
              // grid renders as a pure cover-art wall (no title/year/value
              // text under each tile), matching the design direction that
              // shipped Top Shelf + the value plaque (see git history on
              // this page for "Workshop/Case split"). Wishlist and For Sale
              // keep the full metadata card: a wishlist entry with no price
              // or year context isn't useful to a visitor the way an owned
              // showcase tile is.
              const isWall = activeTab === "owned";
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
                isForSale
                  ? item.listing_price
                  : item.market_value != null && Number(item.market_value) > 0
                  ? Number(item.market_value)
                  : null;
              const cardHref = isForSale && item.listing_id ? `/listing/${item.listing_id}` : d.href;

              const fullTitle = `${d.title}${issueNumberSuffix(d.issueNumber)}`;

              return (
                <div key={item.id} className="profile-book-contact-wrap">
                <Link
                  href={cardHref}
                  className={`comic-card${isWall ? " comic-card--wall" : ""}`}
                  title={isWall ? fullTitle : undefined}
                >
                  <div className="comic-card-cover" style={{ position: "relative" }}>
                    <img src={coverThumb(coverUrl)} alt={d.title} width="400" height="600" loading="lazy" decoding="async" />
                    {!isForSale && item.status === "for_sale" && (
                      <span className="profile-forsale-tag">For sale</span>
                    )}
                    {item.open_to_trade && <span className="profile-trade-tag">Trade</span>}
                    {item.slab_company && item.grade_numeric ? (
                      <span className="profile-grade-badge">
                        {item.slab_company} {Number(item.grade_numeric).toFixed(1)}
                      </span>
                    ) : null}
                    {showOwnerPhotoTag && (
                      <span
                        style={{
                          position: "absolute",
                          // See .profile-grade-badge's z-index comment in
                          // globals.css — same fix needed for any inline
                          // absolute-positioned badge inside .comic-card-cover.
                          zIndex: 2,
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
                  {!isWall && (
                    <>
                      <div className="comic-card-title">
                        {d.title}
                        {issueNumberSuffix(d.issueNumber)}
                        {item.variant_label ? (
                          <span style={{ opacity: 0.7, fontWeight: 500 }}> ({item.variant_label})</span>
                        ) : null}
                      </div>
                      <div className="comic-card-meta">
                        {d.year || "Unknown"}
                        {item.copy_number > 1 ? ` · Copy ${item.copy_number}` : ""}
                        {value != null ? (
                          <span className="profile-card-value">
                            {" · "}${value.toLocaleString()}
                          </span>
                        ) : isForSale ? (
                          <span className="profile-card-value"> · Open to offers</span>
                        ) : null}
                      </div>
                    </>
                  )}
                </Link>
                {!isOwner && user && item.gcd_issue_id && (activeTab === "owned" || activeTab === "for_sale") && (
                  <Link className="profile-book-contact" href={`/inbox/${encodeURIComponent(profileUsername)}?issue=${Number(item.gcd_issue_id)}&copy=${encodeURIComponent(item.id)}&ask=sell`}>Ask about it</Link>
                )}
                </div>
              );
            })}
            {page?.hasMore && (
              <button
                ref={sentinelRef}
                type="button"
                className="primary-btn"
                style={{ gridColumn: "1 / -1", justifySelf: "center" }}
                disabled={loading}
                onClick={() => requestPage(items.length, true)}
              >
                {loading ? "Loading books..." : `Load more books (${items.length} of ${page.total})`}
              </button>
            )}
          </div>
        )}
        {activeTab !== "activity" && viewMode === "rows" && page?.hasMore && (
          <button
            ref={sentinelRef}
            type="button"
            className="primary-btn"
            disabled={loading}
            onClick={() => requestPage(items.length, true)}
          >
            {loading ? "Loading books..." : `Load more books (${items.length} of ${page.total})`}
          </button>
        )}
      </div>
    </div>
  );
}

function SeriesRowsView({ items, activeTab, askAbout = null }) {
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
          const v = Number(isForSale ? it.listing_price : it.market_value);
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
                  <img src={coverThumb(g.cover)} alt="" width="400" height="600" loading="lazy" decoding="async" />
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
                    isForSale
                      ? item.listing_price
                      : item.market_value != null && Number(item.market_value) > 0
                      ? Number(item.market_value)
                      : null;
                  const cardHref = isForSale && item.listing_id ? `/listing/${item.listing_id}` : d.href;
                  return (
                    <div key={item.id} className="profile-book-contact-wrap">
                    <Link href={cardHref} className="comic-card">
                      <div className="comic-card-cover" style={{ position: "relative" }}>
                        <img src={coverThumb(coverUrl)} alt={d.title} width="400" height="600" loading="lazy" decoding="async" />
                        {item.open_to_trade && <span className="profile-trade-tag">Trade</span>}
                        {item.slab_company && item.grade_numeric ? (
                          <span className="profile-grade-badge">
                            {item.slab_company} {Number(item.grade_numeric).toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                      <div className="comic-card-title">
                        {d.title}
                        {issueNumberSuffix(d.issueNumber)}
                        {item.variant_label ? (
                          <span style={{ opacity: 0.7, fontWeight: 500 }}> ({item.variant_label})</span>
                        ) : null}
                      </div>
                      <div className="comic-card-meta">
                        {d.year || "Unknown"}
                        {item.copy_number > 1 ? ` · Copy ${item.copy_number}` : ""}
                        {value != null ? (
                          <span className="profile-card-value">
                            {" · "}${value.toLocaleString()}
                          </span>
                        ) : isForSale ? (
                          <span className="profile-card-value"> · Open to offers</span>
                        ) : null}
                      </div>
                    </Link>
                    {askAbout && item.gcd_issue_id && (activeTab === "owned" || activeTab === "for_sale") && (
                      <Link className="profile-book-contact" href={`/inbox/${encodeURIComponent(askAbout)}?issue=${Number(item.gcd_issue_id)}&copy=${encodeURIComponent(item.id)}&ask=sell`}>Ask about it</Link>
                    )}
                    </div>
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
        const cover = d.canonicalCoverUrl || d.communityCoverUrl || d.personalCoverUrl || "/fallback-cover.png";
        return (
          <li key={item.id} className="profile-activity-item">
            <Link href={d.href} className="profile-activity-link">
              <img className="profile-activity-cover" src={coverThumb(cover)} alt="" width="400" height="600" loading="lazy" decoding="async" />
              <div className="profile-activity-body">
                <div className="profile-activity-line">
                  <ActivityVerb status={item.status} />{" "}
                  <span className="profile-activity-title">
                    {d.title}
                    {issueNumberSuffix(d.issueNumber)}
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
