"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import GradeEditor, { GradeBadge } from "@/components/GradeEditor";
import EmptyState from "@/components/EmptyState";

const hydrationCache = new Map();

const USER_COVER_UPLOAD_ENABLED = true;

function getLibraryHref(item, comic) {
  if (comic?.href) return comic.href;
  if (item?.gcd_issue_id != null) return `/issue/gcd-${item.gcd_issue_id}`;
  if (item?.comic_id != null) return `/comic/${item.comic_id}`;
  return "/library";
}

function normalizePublisherName(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Unknown Publisher";
  if (["marvel", "marvel comics"].includes(lower)) return "Marvel";
  if (["dc", "dc comics"].includes(lower)) return "DC";
  if (["image", "image comics"].includes(lower)) return "Image";
  if (["boom", "boom!", "boom studios", "boom! studios"].includes(lower)) return "Boom";
  if (["idw", "idw publishing"].includes(lower)) return "IDW";
  if (["dark horse", "dark horse comics"].includes(lower)) return "Dark Horse";

  return raw;
}

function makeLibraryKey(item) {
  if (item?.gcd_issue_id != null) return `gcd-${item.gcd_issue_id}`;
  if (item?.comic_id != null) return String(item.comic_id);
  return null;
}

export default function LibraryPage() {
  // useSearchParams below requires a Suspense boundary in Next 15+ for static
  // rendering. Without this, `next build` fails with a CSR-bailout prerender error.
  return (
    <Suspense fallback={null}>
      <LibraryPageContent />
    </Suspense>
  );
}

function LibraryPageContent() {
  const { collections, loading, loadError, refreshLibrary } = useLibrary();
  const { user, isPro, profile } = useAuth();
  const supabase = getSupabaseClient();

  const router = useRouter();
  const searchParams = useSearchParams();

  // Honor ?tab=wishlist (or ?tab=owned) on first load — used by the footer
  // "Wantlist" link and any other deep-link entry into the library.
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return t === "wishlist" || t === "owned" ? t : "owned";
  });
  const [comicIndex, setComicIndex] = useState(() => Object.fromEntries(hydrationCache));

  // hydrationCache is module-scoped and survives navigation/sign-out, which
  // means a previous account's hydrated covers can flash before the new
  // user's data loads. Wipe it whenever the active user changes.
  useEffect(() => {
    hydrationCache.clear();
    setComicIndex({});
  }, [user?.id]);
  const [csvResult, setCsvResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [gradeData, setGradeData] = useState({});

  const [search, setSearch] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  function handleShare() {
    if (!profile?.username) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [sortBy, setSortBy] = useState("title-asc");
  const [viewMode, setViewMode] = useState("list");
  const [pdfExporting, setPdfExporting] = useState(false);
  // Capture the upgrade flag once at mount. After router.replace() strips the
  // query param (in the effect below), this state still holds — so the banner
  // stays visible until the user dismisses it.
  const [upgradeBanner, setUpgradeBanner] = useState(() => {
    const flag = searchParams.get("upgrade");
    if (flag === "success" || flag === "cancelled") return flag;
    return null;
  });

  // Strip the ?upgrade=… query param after mount so refreshes don't keep
  // re-firing the banner. The initial banner value comes from the lazy
  // useState initializer above (it reads searchParams once at mount), so the
  // banner stays visible until the user dismisses it even after replace().
  useEffect(() => {
    const flag = searchParams.get("upgrade");
    if (flag === "success" || flag === "cancelled") {
      router.replace("/library", { scroll: false });
    }
  }, [searchParams, router]);

  async function handleExportPdf() {
    if (!user) return;
    if (!isPro) {
      window.location.href = "/upgrade";
      return;
    }
    setPdfExporting(true);
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402 || err.upgrade) {
          window.location.href = "/upgrade";
          return;
        }
        alert(err.error || "PDF generation failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comixcatalog-collection-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("PDF export failed. Please try again.");
    } finally {
      setPdfExporting(false);
    }
  }

  async function toggleForSale(item) {
    const newStatus = item.status === "for_sale" ? "owned" : "for_sale";
    const { error } = await supabase
      .from("user_collections")
      .update({ status: newStatus })
      .eq("id", item.id);

    if (error) {
      console.error("Sale toggle error:", error);
      return;
    }
    item.status = newStatus;
  }

  const librarySignature = useMemo(() => {
    const keys = [];
    for (const item of collections) {
      const key = makeLibraryKey(item);
      if (key) keys.push(key);
    }
    keys.sort();
    return keys.join("|");
  }, [collections]);

  useEffect(() => {
    let cancelled = false;

    async function loadLibraryItems() {
      const uniqueKeys = librarySignature ? librarySignature.split("|") : [];

      if (uniqueKeys.length === 0) {
        setComicIndex({});
        return;
      }

      // Merge cache into existing state instead of replacing it. Replacing on
      // every signature change blanks out items that were hydrated mid-session
      // but happened to roll out of `hydrationCache` (e.g. via a tab swap) —
      // which is what made fresh wishlist/collection adds appear missing on
      // the library page until a reload re-fetched them.
      const missingKeys = new Set();
      const cachedAdditions = {};
      for (const key of uniqueKeys) {
        if (hydrationCache.has(key)) {
          cachedAdditions[key] = hydrationCache.get(key);
        } else {
          missingKeys.add(key);
        }
      }
      setComicIndex((prev) => ({ ...prev, ...cachedAdditions }));

      if (missingKeys.size === 0) return;

      const comicIds = [];
      const gcdIds = [];
      for (const key of missingKeys) {
        if (key.startsWith("gcd-")) {
          const n = Number(key.slice(4));
          if (!Number.isNaN(n)) gcdIds.push(n);
        } else {
          comicIds.push(key);
        }
      }

      try {
        const res = await fetch("/api/library-hydrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comic_ids: comicIds, gcd_issue_ids: gcdIds }),
        });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        const raw = data.items ?? {};

        const fresh = {};
        for (const [key, item] of Object.entries(raw)) {
          const normalized = {
            ...item,
            publisher: normalizePublisherName(item.publisher),
            rawPublisher: item.publisher ?? "Unknown Publisher",
            cover: item.cover || "/fallback-cover.png",
          };
          fresh[key] = normalized;
          hydrationCache.set(key, normalized);
        }

        if (!cancelled) {
          setComicIndex((prev) => ({ ...prev, ...fresh }));
        }
      } catch (err) {
        console.error("Failed to load library items", err);
      }
    }

    loadLibraryItems();
    return () => {
      cancelled = true;
    };
  }, [librarySignature]);

  const libraryItems = useMemo(() => {
    return collections
      .filter((item) => item.status === tab)
      .map((item) => {
        const key = makeLibraryKey(item);
        if (!key) return null;
        const comic = comicIndex[key];
        // Even without hydration data we surface the row as a stub. Previous
        // behavior (return null) hid freshly-added wishlist/collection items
        // until /api/library-hydrate completed, which made first-attempt adds
        // appear to silently fail. Stub now, real data fills in on next
        // render once hydration resolves.
        const stub = {
          id: key,
          title: "…",
          issueNumber: "",
          year: null,
          publisher: "Unknown Publisher",
          rawPublisher: "Unknown Publisher",
          cover: "/fallback-cover.png",
        };
        const resolved = comic ?? stub;
        return {
          ...item,
          libraryKey: key,
          hydrated: Boolean(comic),
          comic: { ...resolved, href: getLibraryHref(item, comic) },
        };
      })
      .filter(Boolean);
  }, [collections, tab, comicIndex]);

  const availablePublishers = useMemo(() => {
    const counts = {};
    for (const item of libraryItems) {
      const publisher = normalizePublisherName(item.comic?.publisher);
      counts[publisher] = (counts[publisher] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [libraryItems]);

  const filteredItems = useMemo(() => {
    let result = [...libraryItems];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((item) => {
        const title = String(item.comic.title || "").toLowerCase();
        const issue = String(item.comic.issueNumber || "").toLowerCase();
        const publisher = String(item.comic.publisher || "").toLowerCase();
        const year = String(item.comic.year || "").toLowerCase();
        return title.includes(q) || issue.includes(q) || publisher.includes(q) || year.includes(q);
      });
    }

    if (publisherFilter !== "all") {
      result = result.filter(
        (item) => normalizePublisherName(item.comic?.publisher) === publisherFilter
      );
    }

    result.sort((a, b) => {
      const titleA = String(a.comic.title || "").toLowerCase();
      const titleB = String(b.comic.title || "").toLowerCase();
      const yearA = Number(a.comic.year || 0);
      const yearB = Number(b.comic.year || 0);
      const issueA = String(a.comic.issueNumber || "");
      const issueB = String(b.comic.issueNumber || "");

      switch (sortBy) {
        case "title-asc":   return titleA.localeCompare(titleB);
        case "title-desc":  return titleB.localeCompare(titleA);
        case "year-desc":   return yearB - yearA;
        case "year-asc":    return yearA - yearB;
        case "issue-asc":   return issueA.localeCompare(issueB, undefined, { numeric: true });
        case "issue-desc":  return issueB.localeCompare(issueA, undefined, { numeric: true });
        default:            return 0;
      }
    });

    return result;
  }, [libraryItems, search, publisherFilter, sortBy]);

  const isHydrating = useMemo(() => {
    if (collections.length === 0) return false;
    return collections.some((item) => {
      const key = makeLibraryKey(item);
      return key && !comicIndex[key];
    });
  }, [collections, comicIndex]);

  const stats = useMemo(() => {
    const rawCurrent = collections.filter((item) => item.status === tab);
    const hydratedCurrent = rawCurrent
      .map((item) => ({ ...item, comic: comicIndex[makeLibraryKey(item)] || null }))
      .filter((item) => item.comic);

    const ownedCount = collections.filter((c) => c.status === "owned").length;
    const wishlistCount = collections.filter((c) => c.status === "wishlist").length;

    const uniqueSeries = new Set(
      hydratedCurrent.map(
        (item) => `${item.comic?.title || "Untitled"}::${normalizePublisherName(item.comic?.publisher)}`
      )
    ).size;

    const uniquePublishers = new Set(
      hydratedCurrent.map((item) => normalizePublisherName(item.comic?.publisher))
    ).size;

    const withYear = hydratedCurrent.filter((item) => item.comic.year);
    const newestYear = withYear.length
      ? Math.max(...withYear.map((item) => Number(item.comic.year)))
      : "—";

    return { totalInView: rawCurrent.length, renderedInView: hydratedCurrent.length, ownedCount, wishlistCount, uniqueSeries, uniquePublishers, newestYear };
  }, [collections, comicIndex, tab]);

  return (
    <main className="library-shell">
      {upgradeBanner === "success" && (
        <div className="library-upgrade-banner success" role="status">
          <span className="library-upgrade-banner-icon" aria-hidden="true">✓</span>
          <div className="library-upgrade-banner-body">
            <strong>Welcome to Pro.</strong> The Export PDF button below is now unlocked.
          </div>
          <button
            type="button"
            className="library-upgrade-banner-close"
            onClick={() => setUpgradeBanner(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {upgradeBanner === "cancelled" && (
        <div className="library-upgrade-banner cancelled" role="status">
          <div className="library-upgrade-banner-body">
            Checkout cancelled — no charge. <Link href="/upgrade">Try again</Link> when you&rsquo;re ready.
          </div>
          <button
            type="button"
            className="library-upgrade-banner-close"
            onClick={() => setUpgradeBanner(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {loadError && (
        <div className="library-upgrade-banner cancelled" role="alert">
          <div className="library-upgrade-banner-body">
            Couldn&rsquo;t load your library: {loadError}.{" "}
            <button
              type="button"
              className="auth-link-button"
              onClick={() => refreshLibrary?.()}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      <section className="library-page-header">
        <div>
          <div className="library-kicker">Collection Management</div>
          <h1 className="library-title">My Library</h1>
          <p className="library-subtitle">
            Manage your collection, wishlist, and CSV imports from one place.
          </p>
          {profile?.username && (
            <button
              type="button"
              className={`library-share-btn ${shareCopied ? "library-share-btn--copied" : ""}`}
              onClick={handleShare}
            >
              {shareCopied ? "✓ Link copied!" : "↗ Share my collection"}
            </button>
          )}
        </div>
        <div className="library-header-actions">
          {user && (
            <>
              <button
                className="library-secondary-btn"
                onClick={handleExportPdf}
                disabled={pdfExporting}
                type="button"
                title={isPro ? "Export your collection as an insurance PDF" : "Pro feature — click to upgrade"}
              >
                {pdfExporting
                  ? "Generating…"
                  : isPro
                    ? "Export PDF"
                    : "Export PDF (Pro)"}
              </button>
              <Link href="/library/add" className="library-primary-btn">
                Add Comic
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="library-topbar">
        <div className="library-tabs">
          <button
            className={`library-tab ${tab === "owned" ? "active" : ""}`}
            onClick={() => setTab("owned")}
          >
            Collection {stats.ownedCount > 0 && <span className="library-tab-count">{stats.ownedCount}</span>}
          </button>
          <button
            className={`library-tab ${tab === "wishlist" ? "active" : ""}`}
            onClick={() => setTab("wishlist")}
          >
            Wishlist {stats.wishlistCount > 0 && <span className="library-tab-count">{stats.wishlistCount}</span>}
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const file = e.target.file.files[0];
            if (!file || !user) return;
            if (!file.name.endsWith(".csv")) {
              setCsvResult({ created: 0, reused: 0, skipped: 0, errors: [{ row: "-", message: "Invalid file type" }] });
              return;
            }
            const fd = new FormData();
            fd.append("file", file);
            fd.append("user_id", user.id);
            const res = await fetch("/api/csv-import", { method: "POST", body: fd });
            const json = await res.json();
            setCsvResult(json.results || null);
          }}
          className="library-upload-bar"
        >
          <label className={`library-secondary-btn ${selectedFile ? "ready" : ""}`}>
            {selectedFile ? "CSV Ready ✓" : "Choose CSV"}
            <input
              type="file"
              name="file"
              accept=".csv"
              hidden
              onChange={(e) => setSelectedFile(e.target.files[0] || null)}
            />
          </label>
          <button type="submit" className="library-secondary-btn">Upload CSV</button>
        </form>
      </section>

      <section className="library-stats-row">
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.totalInView}</div>
          <div className="library-stat-label">{tab === "owned" ? "Books in Collection" : "Books in Wishlist"}</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.uniqueSeries}</div>
          <div className="library-stat-label">Unique Series</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.uniquePublishers}</div>
          <div className="library-stat-label">Publishers</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.ownedCount}</div>
          <div className="library-stat-label">Total Owned</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.wishlistCount}</div>
          <div className="library-stat-label">Total Wishlist</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.newestYear}</div>
          <div className="library-stat-label">Newest Year in View</div>
        </div>
      </section>

      {csvResult && (
        <section className="library-import-summary">
          <div className="library-import-title">Import Summary</div>
          <div className="library-import-grid">
            <div>Created: {csvResult.created}</div>
            <div>Reused: {csvResult.reused}</div>
            <div>Skipped: {csvResult.skipped}</div>
          </div>
          {csvResult.errors?.length > 0 && (
            <div className="library-import-errors">
              <strong>Errors ({csvResult.errors.length})</strong>
              <ul>
                {csvResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>Row {err.row}: {err.message}</li>
                ))}
              </ul>
              {csvResult.errors.length > 5 && (
                <div className="library-import-note">Showing first 5 errors…</div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="library-layout">
        <aside className="library-sidebar">
          <div className="library-sidebar-section">
            <div className="library-sidebar-title">Search Library</div>
            <input
              className="library-search-input"
              placeholder={`Search ${tab === "owned" ? "collection" : "wishlist"}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="library-sidebar-section">
            <div className="library-sidebar-title">Publisher</div>
            <select
              className="library-select"
              value={publisherFilter}
              onChange={(e) => setPublisherFilter(e.target.value)}
            >
              <option value="all">All Publishers</option>
              {availablePublishers.map((pub) => (
                <option key={pub.name} value={pub.name}>{pub.name} ({pub.count})</option>
              ))}
            </select>
          </div>

          <div className="library-sidebar-section">
            <div className="library-sidebar-title">Quick Filters</div>
            <button
              className={`library-filter-chip ${publisherFilter === "all" ? "active" : ""}`}
              onClick={() => setPublisherFilter("all")}
              type="button"
            >
              All Publishers
            </button>
            {availablePublishers.slice(0, 8).map((pub) => (
              <button
                key={pub.name}
                className={`library-filter-chip ${publisherFilter === pub.name ? "active" : ""}`}
                onClick={() => setPublisherFilter(pub.name)}
                type="button"
              >
                {pub.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="library-results-panel">
          <div className="library-results-header">
            <div className="library-results-copy">
              <h2>{tab === "owned" ? "Collection" : "Wishlist"}</h2>
              <p>{filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}</p>
            </div>
            <div className="library-results-controls">
              <select
                className="library-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="title-asc">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
                <option value="year-desc">Year Newest</option>
                <option value="year-asc">Year Oldest</option>
                <option value="issue-asc">Issue Low–High</option>
                <option value="issue-desc">Issue High–Low</option>
              </select>
              <div className="library-view-toggle">
                <button
                  type="button"
                  className={`library-view-btn ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => setViewMode("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  className={`library-view-btn ${viewMode === "grid" ? "active" : ""}`}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </button>
              </div>
            </div>
          </div>

          {loading && <div className="library-empty-state">Loading…</div>}

          {!loading && filteredItems.length === 0 && isHydrating && (
            <div className={viewMode === "grid" ? "comic-grid" : "library-list"}>
              {Array.from({ length: Math.min(stats.totalInView || 6, 12) }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className={viewMode === "grid" ? "comic-card library-skeleton-card" : "library-list-row library-skeleton-row"}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}

          {!loading && filteredItems.length === 0 && !isHydrating && (
            (() => {
              // Different empty states depending on whether the user has *any*
              // items in this tab (true empty) or just no items matching the
              // current search/filter (filtered empty).
              const totalInTab = collections.filter((c) => c.status === tab).length;
              if (totalInTab === 0) {
                return tab === "owned" ? (
                  <EmptyState
                    icon="📚"
                    title="No comics in your collection yet"
                    body="Search the database for any series or issue, then add it to your collection to start tracking grades, values, and variants."
                    ctaHref="/search"
                    ctaLabel="Browse the database"
                    secondary={{ href: "/library/add", label: "Add a comic manually" }}
                  />
                ) : (
                  <EmptyState
                    icon="🎯"
                    title="Your wantlist is empty"
                    body="Add issues you're hunting for. We'll surface them when sellers list matching copies, and your wantlist becomes a public link you can share."
                    ctaHref="/search"
                    ctaLabel="Find issues to track"
                  />
                );
              }
              // Filtered empty (search / publisher filter active)
              return (
                <EmptyState
                  icon="🔍"
                  title="No matches"
                  body={`Nothing in your ${tab === "owned" ? "collection" : "wishlist"} matches the current search or filter.`}
                />
              );
            })()
          )}

          {/* ── LIST VIEW ── */}
          {!loading && filteredItems.length > 0 && viewMode === "list" && (
            <div className="library-list">
              {filteredItems.map((item) => {
                const comic = item.comic;

                // Merge live grade state with DB values
                const liveGrade = gradeData[item.id] ?? {
                  grade_numeric: item.grade_numeric ?? null,
                  condition: item.condition ?? null,
                  slab_company: item.slab_company ?? null,
                  slab_cert_number: item.slab_cert_number ?? null,
                  notes: item.notes ?? null,
                  purchase_price: item.purchase_price ?? null,
                  market_value: item.market_value ?? null,
                  user_cover_url: USER_COVER_UPLOAD_ENABLED ? (item.user_cover_url ?? null) : null,
                };

                const displayCover =
                  liveGrade.user_cover_url || comic.cover || "/fallback-cover.png";

                return (
                  <article
                    key={`${item.id}-${item.libraryKey}-${item.status}`}
                    className="library-list-row"
                  >
                    <Link href={getLibraryHref(item, comic)} className="library-list-cover">
                      <img
                        src={displayCover}
                        alt={comic.title}
                        loading="lazy"
                      />
                      {USER_COVER_UPLOAD_ENABLED && liveGrade.user_cover_url && (
                        <span className="library-cover-tag" title="Your photo">Your photo</span>
                      )}
                    </Link>

                    <div className="library-list-main">
                      <Link href={getLibraryHref(item, comic)} className="library-list-title">
                        {comic.title}
                        {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                      </Link>

                      <div className="library-list-meta">
                        <span>{comic.publisher || "Unknown Publisher"}</span>
                        <span>•</span>
                        <span>{comic.year || "Unknown Year"}</span>
                        <span>•</span>
                        <span>{tab === "owned" ? "In Collection" : "On Wishlist"}</span>
                        {liveGrade.slab_company && (
                          <>
                            <span>•</span>
                            <span style={{ color: "var(--cc-gold)", fontWeight: 700 }}>
                              {liveGrade.slab_company}
                            </span>
                          </>
                        )}
                        {liveGrade.purchase_price != null && (
                          <>
                            <span>•</span>
                            <span title="What you paid">
                              Paid ${Number(liveGrade.purchase_price).toFixed(2)}
                            </span>
                          </>
                        )}
                        {liveGrade.market_value != null && (
                          <>
                            <span>•</span>
                            <span style={{ color: "var(--cc-gold)" }} title="Market value">
                              Worth ${Number(liveGrade.market_value).toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>

                      {tab === "owned" && (
                        <GradeEditor
                          collectionId={item.id}
                          initialData={liveGrade}
                          canonicalCover={comic.cover || null}
                          onSave={(updated) =>
                            setGradeData((prev) => ({
                              ...prev,
                              [item.id]: { ...liveGrade, ...updated },
                            }))
                          }
                        />
                      )}
                    </div>

                    <div className="library-list-actions">
                      {tab === "owned" && (
                        <button
                          className="library-row-btn"
                          onClick={() => toggleForSale(item)}
                          type="button"
                        >
                          {item.status === "for_sale" ? "Remove Sale Flag" : "Mark For Sale"}
                        </button>
                      )}
                      <Link href={getLibraryHref(item, comic)} className="library-row-btn primary">
                        View
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* ── GRID VIEW ── */}
          {!loading && filteredItems.length > 0 && viewMode === "grid" && (
            <div className="comic-grid">
              {filteredItems.map((item) => {
                const comic = item.comic;
                const liveGrade = gradeData[item.id] ?? {
                  grade_numeric: item.grade_numeric ?? null,
                  condition: item.condition ?? null,
                  slab_company: item.slab_company ?? null,
                  slab_cert_number: item.slab_cert_number ?? null,
                  notes: item.notes ?? null,
                  purchase_price: item.purchase_price ?? null,
                  market_value: item.market_value ?? null,
                  user_cover_url: USER_COVER_UPLOAD_ENABLED ? (item.user_cover_url ?? null) : null,
                };

                const displayCover =
                  liveGrade.user_cover_url || comic.cover || "/fallback-cover.png";

                return (
                  <article
                    key={`${item.id}-${item.libraryKey}-${item.status}`}
                    className="comic-card"
                  >
                    <Link href={getLibraryHref(item, comic)} className="card-link">
                      <div className="comic-card-cover">
                        <img
                          src={displayCover}
                          alt={comic.title}
                          loading="lazy"
                        />
                        {USER_COVER_UPLOAD_ENABLED && liveGrade.user_cover_url && (
                          <span className="library-cover-tag" title="Your photo">Your photo</span>
                        )}
                      </div>
                      <div className="comic-card-title">
                        {comic.title}
                        {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                      </div>
                      <div className="comic-card-meta">
                        {comic.publisher || "Unknown Publisher"} • {comic.year || "Unknown"}
                      </div>
                    </Link>

                    {(liveGrade.grade_numeric || liveGrade.condition) && (
                      <div style={{ padding: "4px 10px 0" }}>
                        <GradeBadge
                          grade={liveGrade.grade_numeric}
                          company={liveGrade.slab_company}
                          condition={liveGrade.condition}
                        />
                      </div>
                    )}

                    {tab === "owned" && (
                      <div className="comic-card-grade">
                        <GradeEditor
                          collectionId={item.id}
                          initialData={liveGrade}
                          canonicalCover={comic.cover || null}
                          onSave={(updated) =>
                            setGradeData((prev) => ({
                              ...prev,
                              [item.id]: { ...liveGrade, ...updated },
                            }))
                          }
                          />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}