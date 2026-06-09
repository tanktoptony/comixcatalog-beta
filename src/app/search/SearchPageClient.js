"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLibrary } from "../../context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import EmptyState from "@/components/EmptyState";

const PAGE_SIZE = 36;

function resolveCoverUrl(rawCover) {
  if (!rawCover) return null;
  if (/^https?:\/\//i.test(rawCover)) return rawCover;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${rawCover}`;
}

function normalizeYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n >= 1800 && n <= 2100) return Math.trunc(n);
  return null;
}

function formatYearRange(start, end) {
  const s = normalizeYear(start);
  const e = normalizeYear(end);
  if (!s) return "";
  if (!e || e === s) return String(s);
  return `${s}–${e}`;
}

function mapSupabaseComic(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id ?? null,
    seriesId: row.series_id ?? null,
    title: row.series_title ?? row.title ?? null,
    issueNumber: row.issue_number ?? null,
    year: row.release_year ?? null,
    publisher: row.publisher || null,
    issueCount: row.issue_count ?? null,
    cover: resolveCoverUrl(row.cover_path),
    __source: row.__source || "user",
    created_by: row.created_by ?? null,
  };
}

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <article className="comic-card" aria-hidden="true">
      <div
        className="comic-card-cover skeleton"
        style={{ aspectRatio: "2/3", borderRadius: 8 }}
      />
      <div className="skeleton" style={{ height: 14, margin: "10px 0 6px", borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 4 }} />
    </article>
  );
}

export default function SearchPageClient() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(urlQuery);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  const [supabaseComics, setSupabaseComics] = useState([]);
  const [seriesResults, setSeriesResults] = useState([]);

  const [publisherFilter, setPublisherFilter] = useState(null);
  const [collectionFilter, setCollectionFilter] = useState("all");

  const [isBrowsing, setIsBrowsing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const { wishlistIds, collectionIds, addToCollection, removeFromCollection } =
    useLibrary();
  const { user } = useAuth();

  // ── Fetch comics (browse or search) ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const url = query
          ? `/api/search/comics?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
          : `/api/comics?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;

        setIsBrowsing(!query);

        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        const data = await res.json();
        const comics = Array.isArray(data?.comics) ? data.comics : [];

        if (cancelled) return;

        setHasMore(comics.length === PAGE_SIZE);

        setSupabaseComics((prev) => {
          const merged = page === 0 ? comics : [...prev, ...comics];
          const deduped = [];
          const seen = new Set();
          for (const row of merged) {
            const key = String(row?.id ?? "");
            if (!key || seen.has(key)) continue;
            seen.add(key);
            deduped.push(row);
          }
          return deduped;
        });
      } catch (err) {
        console.error("Search comics load failed:", err);
        if (!cancelled) {
          setLoadError("Could not load comics right now. Please try again.");
          if (page === 0) setSupabaseComics([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsFirstLoad(false);
        }
      }
    }, query ? 400 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, page]);

  // ── Reset page/filter on new query (keep old results visible until new ones arrive) ──
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    setLoadError(null);
    setPublisherFilter(null);
  }, [query]);

  // ── Series suggestions ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!query) {
      setSeriesResults([]);
      return;
    }

    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/series?q=${encodeURIComponent(query)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`Series request failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setSeriesResults(Array.isArray(data?.series) ? data.series.filter(Boolean) : []);
        }
      } catch (err) {
        console.error("Series search failed:", err);
        if (!cancelled) setSeriesResults([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  // ── Map + dedupe comics ──────────────────────────────────────────────────────
  const mappedComics = useMemo(() => {
    const mapped = supabaseComics.filter(Boolean).map(mapSupabaseComic).filter((item) => item && item.id);
    const deduped = [];
    const seen = new Set();
    for (const item of mapped) {
      const key = String(item.id);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  }, [supabaseComics]);

  // ── Dynamic publisher list from current results ──────────────────────────────
  const availablePublishers = useMemo(() => {
    const counts = {};
    for (const item of mappedComics) {
      const pub = (item.publisher || "").trim();
      if (!pub) continue;
      counts[pub] = (counts[pub] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }, [mappedComics]);

  // ── Apply collection/wishlist filters only (server already handled query+publisher) ──
  const results = useMemo(() => {
    let filtered = mappedComics;

    // Publisher filter (client-side on current page's results)
    if (publisherFilter) {
      filtered = filtered.filter((item) =>
        String(item.publisher || "").toLowerCase().includes(publisherFilter.toLowerCase())
      );
    }

    if (collectionFilter === "collection") {
      filtered = filtered.filter((item) => collectionIds.has(item.id));
    } else if (collectionFilter === "wishlist") {
      filtered = filtered.filter((item) => wishlistIds.has(item.id));
    }

    return filtered;
  }, [mappedComics, publisherFilter, collectionFilter, collectionIds, wishlistIds]);

  const togglePublisher = useCallback((pub) => {
    setPublisherFilter((prev) => (prev === pub ? null : pub));
  }, []);

  const toggleCollection = useCallback((val) => {
    setCollectionFilter((prev) => (prev === val ? "all" : val));
  }, []);

  return (
    <section className="comic-panel">
      <div className="section-label badge-x">Search</div>
      <h1 className="hero-title">Find Comics</h1>

      {/* Search input */}
      <div className="controls">
        <input
          className="input"
          placeholder="Search series, issues, publishers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Series suggestions — grouped by title, divider between groups */}
      {seriesResults.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <h3 className="section-label">Series</h3>
          {(() => {
            // Group consecutive rows by normalized title so "Batman" 1940 and
            // "Batman" 2016 sit together, with a horizontal divider between
            // distinct titles.
            const titleKey = (s) =>
              String(s?.title ?? "")
                .trim()
                .toLowerCase()
                .replace(/\b(the|a|an)\b/g, "")
                .replace(/[^a-z0-9]/g, "");

            const groups = [];
            for (const s of seriesResults) {
              if (!s?.id) continue;
              const key = titleKey(s);
              const last = groups[groups.length - 1];
              if (last && last.key === key) last.rows.push(s);
              else groups.push({ key, rows: [s] });
            }

            return groups.map((group, gi) => (
              <div key={`series-group-${gi}`}>
                {gi > 0 && <hr className="series-volume-divider" />}
                <div className="comic-grid">
                  {group.rows.map((s) => {
                    const yearLabel = formatYearRange(s.year_start, s.year_end);
                    const volumeLabel =
                      s.volume_count && s.volume_count > 1 && s.volume_index
                        ? `Vol. ${s.volume_index} of ${s.volume_count}`
                        : null;
                    return (
                      <Link
                        key={s.id}
                        href={`/series/${s.id}`}
                        className="comic-card"
                      >
                        <div className="comic-card-title">
                          {s.title || "Untitled Series"}
                        </div>
                        <div className="comic-card-meta">
                          {[
                            s.publisher?.name || "Unknown Publisher",
                            yearLabel,
                            volumeLabel,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {/* Filter bar */}
      <div className="filter-bar">
        {/* Dynamic publisher filters from actual results */}
        {availablePublishers.map((pub) => (
          <button
            key={pub}
            className={`filter-btn ${publisherFilter === pub ? "active" : ""}`}
            onClick={() => togglePublisher(pub)}
          >
            {pub}
          </button>
        ))}

        {/* Divider if publishers exist */}
        {availablePublishers.length > 0 && (
          <span style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />
        )}

        <button
          className={`filter-btn ${collectionFilter === "collection" ? "active" : ""}`}
          onClick={() => toggleCollection("collection")}
        >
          In My Collection
        </button>

        <button
          className={`filter-btn ${collectionFilter === "wishlist" ? "active" : ""}`}
          onClick={() => toggleCollection("wishlist")}
        >
          Wishlist
        </button>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="empty-state" style={{ color: "rgba(255,100,100,0.9)" }}>
          {loadError}
        </div>
      )}

      {/* Result count */}
      {!isFirstLoad && !loadError && (
        <p className="muted">
          {results.length} result{results.length === 1 ? "" : "s"}
          {query ? ` for "${query}"` : " — featured series"}
          {publisherFilter ? ` · ${publisherFilter}` : ""}
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && !isFirstLoad && results.length === 0 && (
        query ? (
          <EmptyState
            icon="🔍"
            title={`No results for "${query}"`}
            body="Try a broader search, fewer words, or check the spelling. Series titles are the most reliable way to find an issue."
            secondary={{ href: "/search", label: "Clear search" }}
          />
        ) : (
          <EmptyState
            icon="📚"
            title="Nothing to browse yet"
            body="The database is still being populated. Check back soon."
          />
        )
      )}

      {/* Comic grid */}
      <div className="comic-grid">
        {/* Skeleton cards on first load */}
        {isFirstLoad &&
          Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}

        {/* Real results */}
        {!isFirstLoad &&
          results.map((item) => {
            const isSeries = item.__source === "series";
            const isUserAdded = item.__source === "user";
            const inCollection = !isSeries && collectionIds.has(item.id);
            const inWishlist = !isSeries && wishlistIds.has(item.id);
            const coverSrc = item.cover || "/fallback-cover.png";
            const comicHref = isSeries
              ? `/series/${item.seriesId}`
              : isUserAdded
              ? `/comic/${item.id}`
              : `/issue/${item.id}`;

            return (
              <article key={item.id} className="comic-card">
                <Link href={comicHref} className="card-link">
                  <div className="comic-card-cover">
                    <img
                      src={coverSrc}
                      alt={item.title || "Comic cover"}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-cover.png";
                      }}
                    />
                  </div>

                  <div className="comic-card-title">
                    {item.title || "Untitled"}
                    {item.issueNumber ? ` #${item.issueNumber}` : ""}
                  </div>

                  <div className="comic-card-meta">
                    {isSeries
                      ? [
                          item.publisher,
                          item.year,
                          item.issueCount ? `${item.issueCount} issues` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Unknown"
                      : [item.publisher, item.year].filter(Boolean).join(" · ") ||
                        "Unknown"}
                  </div>

                  {isUserAdded && (
                    <span className="pill pill-new">User Added</span>
                  )}
                </Link>

                {!isSeries && (
                  <div className="comic-card-pills">
                    {inCollection && (
                      <span className="pill pill-collection">In Collection</span>
                    )}
                    {inWishlist && (
                      <span className="pill pill-wishlist">On Wishlist</span>
                    )}
                  </div>
                )}

                {!isSeries && (
                  <div className="comic-card-actions">
                    {!inCollection && !inWishlist && (
                      user ? (
                        <>
                          <button
                            className="comic-btn"
                            onClick={() => addToCollection(item.id, "owned")}
                          >
                            + Collection
                          </button>
                          <button
                            className="comic-btn"
                            onClick={() => addToCollection(item.id, "wishlist")}
                          >
                            + Wantlist
                          </button>
                        </>
                      ) : (
                        // Anon: route to signup with a return path. Beats
                        // disabled buttons with hover-only tooltip — anon
                        // visitors on touch devices never see those.
                        <Link
                          href={`/signup?next=${encodeURIComponent("/search")}`}
                          className="comic-btn"
                          style={{ textDecoration: "none", textAlign: "center" }}
                        >
                          + Save
                        </Link>
                      )
                    )}

                    {inCollection && (
                      <button
                        className="comic-btn comic-btn-danger"
                        onClick={() => removeFromCollection(item.id)}
                      >
                        Remove
                      </button>
                    )}

                    {inWishlist && (
                      <button
                        className="comic-btn comic-btn-danger"
                        onClick={() => removeFromCollection(item.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}

        {/* Inline skeleton cards while loading more */}
        {isLoading &&
          !isFirstLoad &&
          Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={`more-${i}`} />
          ))}
      </div>

      {/* Load more */}
      {hasMore && !isLoading && !isFirstLoad && results.length > 0 && (
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <button className="comic-btn" onClick={() => setPage((p) => p + 1)}>
            Load More
          </button>
        </div>
      )}
    </section>
  );
}