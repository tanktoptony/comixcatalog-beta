"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

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

export default function LibraryPage() {
  const { collections, loading } = useLibrary();
  const { user } = useAuth();
  const supabase = getSupabaseClient();

  const [tab, setTab] = useState("owned");
  const [comicIndex, setComicIndex] = useState({});
  const [csvResult, setCsvResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const [search, setSearch] = useState("");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [sortBy, setSortBy] = useState("title-asc");
  const [viewMode, setViewMode] = useState("list");

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

  useEffect(() => {
  async function loadCanonicalIssues() {
    const ids = [
      ...new Set(
        collections
          .map((item) => String(item.comic_id || ""))
          .filter(Boolean)
      ),
    ];

    if (ids.length === 0) {
      setComicIndex({});
      return;
    }

    try {
      const results = await Promise.all(
        ids.map(async (issueId) => {
          try {
            const res = await fetch(`/api/issues/${issueId}`, {
              cache: "no-store",
            });

            const data = await res.json();

            if (!res.ok || !data?.issue) return null;

            const issue = data.issue;

            return {
              id: String(issue.id),
              title: issue.series_title || "Untitled",
              issueNumber: issue.issue_number || "",
              year: issue.release_year || null,
              publisher: normalizePublisherName(issue.publisher),
              rawPublisher: issue.publisher || "Unknown Publisher",
              cover: issue.cover || "/fallback-cover.png",
              source: issue.source || "gcd",
            };
          } catch (err) {
            console.error(`Failed to load issue ${issueId}`, err);
            return null;
          }
        })
      );

      const index = {};
      for (const item of results) {
        if (!item?.id) continue;
        index[item.id] = item;
      }

      setComicIndex(index);
    } catch (err) {
      console.error("Failed to load canonical library issues", err);
      setComicIndex({});
    }
  }

  loadCanonicalIssues();
}, [collections]);

  const libraryItems = useMemo(() => {
    return collections
      .filter((item) => item.status === tab)
      .map((item) => {
        const comic = comicIndex[String(item.comic_id)];
        if (!comic) return null;

        return {
          ...item,
          comic,
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

        return (
          title.includes(q) ||
          issue.includes(q) ||
          publisher.includes(q) ||
          year.includes(q)
        );
      });
    }

    if (publisherFilter !== "all") {
      result = result.filter(
        (item) =>
          normalizePublisherName(item.comic?.publisher) === publisherFilter
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
        case "title-asc":
          return titleA.localeCompare(titleB);
        case "title-desc":
          return titleB.localeCompare(titleA);
        case "year-desc":
          return yearB - yearA;
        case "year-asc":
          return yearA - yearB;
        case "issue-asc":
          return issueA.localeCompare(issueB, undefined, { numeric: true });
        case "issue-desc":
          return issueB.localeCompare(issueA, undefined, { numeric: true });
        default:
          return 0;
      }
    });

    return result;
  }, [libraryItems, search, publisherFilter, sortBy]);

  const stats = useMemo(() => {
  const rawCurrent = collections.filter((item) => item.status === tab);

  const hydratedCurrent = rawCurrent
    .map((item) => ({
      ...item,
      comic: comicIndex[String(item.comic_id)] || null,
    }))
    .filter((item) => item.comic);

  const ownedCount = collections.filter((c) => c.status === "owned").length;
  const wishlistCount = collections.filter((c) => c.status === "wishlist").length;

  const uniqueSeries = new Set(
    hydratedCurrent.map(
      (item) =>
        `${item.comic?.title || "Untitled"}::${normalizePublisherName(item.comic?.publisher)}`
    )
  ).size;

  const uniquePublishers = new Set(
    hydratedCurrent.map((item) => item.comic.publisher || "Unknown Publisher")
  ).size;

  const withYear = hydratedCurrent.filter((item) => item.comic.year);
  const newestYear = withYear.length
    ? Math.max(...withYear.map((item) => Number(item.comic.year)))
    : "—";

  return {
    totalInView: rawCurrent.length,
    renderedInView: hydratedCurrent.length,
    ownedCount,
    wishlistCount,
    uniqueSeries,
    uniquePublishers,
    newestYear,
  };
}, [collections, comicIndex, tab]);
  return (
    <main className="library-shell">
      <section className="library-page-header">
        <div>
          <div className="library-kicker">Collection Management</div>
          <h1 className="library-title">My Library</h1>
          <p className="library-subtitle">
            Manage your collection, wishlist, and CSV imports from one place.
          </p>
        </div>

        <div className="library-header-actions">
          {user && (
            <Link href="/library/add" className="library-primary-btn">
              Add Comic
            </Link>
          )}
        </div>
      </section>

      <section className="library-topbar">
        <div className="library-tabs">
          <button
            className={`library-tab ${tab === "owned" ? "active" : ""}`}
            onClick={() => setTab("owned")}
          >
            Collection
          </button>

          <button
            className={`library-tab ${tab === "wishlist" ? "active" : ""}`}
            onClick={() => setTab("wishlist")}
          >
            Wishlist
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const file = e.target.file.files[0];
            if (!file || !user) return;

            if (!file.name.endsWith(".csv")) {
              setCsvResult({
                created: 0,
                reused: 0,
                skipped: 0,
                errors: [{ row: "-", message: "Invalid file type" }],
              });
              return;
            }

            const fd = new FormData();
            fd.append("file", file);
            fd.append("user_id", user.id);

            const res = await fetch("/api/csv-import", {
              method: "POST",
              body: fd,
            });

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
              onChange={(e) => {
                const file = e.target.files[0];
                setSelectedFile(file || null);
              }}
            />
          </label>

          <button type="submit" className="library-secondary-btn">
            Upload CSV
          </button>
        </form>
      </section>

      <section className="library-stats-row">
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.totalInView}</div>
          <div className="library-stat-label">
            {tab === "owned" ? "Books in Collection" : "Books in Wishlist"}
          </div>
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
                  <li key={i}>
                    Row {err.row}: {err.message}
                  </li>
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
                <option key={pub.name} value={pub.name}>
                  {pub.name} ({pub.count})
                </option>
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
              <h2>
                {tab === "owned" ? "Collection" : "Wishlist"}
              </h2>
              <p>
                {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
              </p>
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

          {!loading && filteredItems.length === 0 && (
            <div className="library-empty-state">
              No comics match this view yet.
            </div>
          )}

          {!loading && filteredItems.length > 0 && viewMode === "list" && (
            <div className="library-list">
              {filteredItems.map((item) => {
                const comic = item.comic;

                return (
                  <article
                    key={`${item.id}-${item.comic_id}-${item.status}`}
                    className="library-list-row"
                  >
                    <Link href={`/comic/${item.comic_id}`} className="library-list-cover">
                      <img
                        src={comic.cover || "/fallback-cover.png"}
                        alt={comic.title}
                        loading="lazy"
                      />
                    </Link>

                    <div className="library-list-main">
                      <Link href={`/comic/${item.comic_id}`} className="library-list-title">
                        {comic.title}
                        {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                      </Link>

                      <div className="library-list-meta">
                        <span>{comic.publisher || "Unknown Publisher"}</span>
                        <span>•</span>
                        <span>{comic.year || "Unknown Year"}</span>
                        <span>•</span>
                        <span>{tab === "owned" ? "In Collection" : "On Wishlist"}</span>
                      </div>
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

                      <Link href={`/comic/${item.comic_id}`} className="library-row-btn primary">
                        View
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {!loading && filteredItems.length > 0 && viewMode === "grid" && (
            <div className="comic-grid">
              {filteredItems.map((item) => {
                const comic = item.comic;

                return (
                  <article
                    key={`${item.id}-${item.comic_id}-${item.status}`}
                    className="comic-card"
                  >
                    <Link href={`/comic/${item.comic_id}`} className="card-link">
                      <div className="comic-card-cover">
                        <img
                          src={comic.cover || "/fallback-cover.png"}
                          alt={comic.title}
                          loading="lazy"
                        />
                      </div>

                      <div className="comic-card-title">
                        {comic.title}
                        {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                      </div>

                      <div className="comic-card-meta">
                        {comic.publisher || "Unknown Publisher"} • {comic.year || "Unknown"}
                      </div>
                    </Link>
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