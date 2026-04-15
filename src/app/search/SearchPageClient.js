"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useLibrary } from "../../context/LibraryContext";
import { useAuth } from "@/context/AuthContext";

function resolveCoverUrl(rawCover) {
  if (!rawCover) return null;

  if (/^https?:\/\//i.test(rawCover)) {
    return rawCover;
  }

  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${rawCover}`;
}

function mapSupabaseComic(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.id ?? null,
    title: row.series_title ?? row.title ?? null,
    issueNumber: row.issue_number ?? null,
    year: row.release_year ?? null,
    publisher: row.publisher || null,
    cover: resolveCoverUrl(row.cover_path),
    __source: row.__source || "user",
    created_by: row.created_by ?? null,
  };
}

export default function SearchPageClient() {
  const [publisherFilter, setPublisherFilter] = useState(null);
  const [yearRange, setYearRange] = useState(null);
  const [collectionFilter, setCollectionFilter] = useState("all");

  const [query, setQuery] = useState("");
  const [supabaseComics, setSupabaseComics] = useState([]);
  const [page, setPage] = useState(0);
  const [seriesResults, setSeriesResults] = useState([]);
  const [isBrowsing, setIsBrowsing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const { wishlistIds, collectionIds, addToCollection, removeFromCollection } =
    useLibrary();

  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        let url;

        if (!query) {
          setIsBrowsing(true);
          url = `/api/comics?limit=100&offset=${page * 100}`;
        } else {
          setIsBrowsing(false);
          url = `/api/search/comics?q=${encodeURIComponent(query)}&limit=100&offset=${page * 100}`;
        }

        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) {
          throw new Error(`Search request failed: ${res.status}`);
        }

        const data = await res.json();
        const comics = Array.isArray(data?.comics) ? data.comics : [];

        if (cancelled) return;

        setHasMore(comics.length === 100);

        setSupabaseComics((prev) => {
          if (page === 0) return comics;
          return [...prev, ...comics];
        });
      } catch (err) {
        console.error("Search comics load failed:", err);
        if (!cancelled) {
          setLoadError("Could not load comics right now.");
          if (page === 0) setSupabaseComics([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, page]);

  useEffect(() => {
    setPage(0);
    setSupabaseComics([]);
    setHasMore(true);
    setLoadError(null);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setSeriesResults([]);
      return;
    }

    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/series?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`Series request failed: ${res.status}`);
        }

        const data = await res.json();
        const series = Array.isArray(data?.series) ? data.series : [];

        if (!cancelled) {
          setSeriesResults(series.filter(Boolean));
        }
      } catch (err) {
        console.error("Series search failed:", err);
        if (!cancelled) {
          setSeriesResults([]);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const results = useMemo(() => {
    const mappedSupabase = supabaseComics
      .filter(Boolean)
      .map(mapSupabaseComic)
      .filter((item) => item && item.id);

    let filtered = mappedSupabase;

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter((item) =>
        String(item.title || "").toLowerCase().includes(q) ||
        String(item.issueNumber || "").toLowerCase().includes(q) ||
        String(item.publisher || "").toLowerCase().includes(q)
      );
    }

    if (publisherFilter) {
      filtered = filtered.filter((item) => {
        const publisher = String(item.publisher || "").toLowerCase();
        return publisher.includes(publisherFilter.toLowerCase());
      });
    }

    if (yearRange) {
      filtered = filtered.filter((item) => item.year === yearRange);
    }

    if (collectionFilter === "collection") {
      filtered = filtered.filter((item) => collectionIds.has(item.id));
    }

    if (collectionFilter === "wishlist") {
      filtered = filtered.filter((item) => wishlistIds.has(item.id));
    }

    return filtered;
  }, [
    query,
    supabaseComics,
    publisherFilter,
    yearRange,
    collectionFilter,
    collectionIds,
    wishlistIds,
  ]);

  return (
    <section className="comic-panel">
      <div className="section-label badge-x">Search</div>
      <h1 className="hero-title">Find Comics</h1>

      <div className="controls">
        <input
          className="input"
          placeholder="Search comics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {seriesResults.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <h3 className="section-label">Series</h3>

          <div className="comic-grid">
            {seriesResults.map((s) => {
              if (!s?.id) return null;

              return (
                <Link
                  key={s.id}
                  href={`/series/${s.id}`}
                  className="comic-card"
                >
                  <div className="comic-card-title">{s.title || "Untitled Series"}</div>
                  <div className="comic-card-meta">
                    {s.publisher?.name || "Unknown Publisher"}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="filter-bar">
        {["Marvel", "DC", "Image", "Dark Horse", "Boom", "IDW", "Evil Ink", "Vertigo"].map((pub) => (
          <button
            key={pub}
            className={`filter-btn ${publisherFilter === pub ? "active" : ""}`}
            onClick={() =>
              setPublisherFilter(publisherFilter === pub ? null : pub)
            }
          >
            {pub}
          </button>
        ))}

        <button
          className={`filter-btn ${collectionFilter === "collection" ? "active" : ""}`}
          onClick={() =>
            setCollectionFilter(collectionFilter === "collection" ? "all" : "collection")
          }
        >
          In My Collection
        </button>

        <button
          className={`filter-btn ${collectionFilter === "wishlist" ? "active" : ""}`}
          onClick={() =>
            setCollectionFilter(collectionFilter === "wishlist" ? "all" : "wishlist")
          }
        >
          Wishlist
        </button>
      </div>

      {loadError && <div className="empty-state">{loadError}</div>}

      <p className="muted">
        {results.length} result{results.length === 1 ? "" : "s"} found
        {query && ` for “${query}”`}
        {!query && isBrowsing ? " in browse mode" : ""}
      </p>

      {!isLoading && !loadError && results.length === 0 && (
        <div className="empty-state">No comics match your search yet.</div>
      )}

      <div className="comic-grid">
        {results.map((item) => {
          const inCollection = collectionIds.has(item.id);
          const inWishlist = wishlistIds.has(item.id);
          const isUserAdded = item.__source === "user";
          const coverSrc = item.cover || "/fallback-cover.png";
          const comicHref = isUserAdded ? `/comic/${item.id}` : "#";

          return (
            <article key={item.id} className="comic-card">
              {isUserAdded ? (
                <Link href={comicHref} className="card-link">
                  <div className="comic-card-cover">
                    <img src={coverSrc} alt={item.title || "Comic cover"} loading="lazy" />
                  </div>

                  <div className="comic-card-title">
                    {item.title || "Untitled"}
                    {item.issueNumber ? ` #${item.issueNumber}` : ""}
                  </div>

                  <div className="comic-card-meta">{item.year || "Unknown"}</div>

                  <span className="pill pill-new">User Added</span>
                </Link>
              ) : (
                <div className="card-link">
                  <div className="comic-card-cover">
                    <img src={coverSrc} alt={item.title || "Comic cover"} loading="lazy" />
                  </div>

                  <div className="comic-card-title">
                    {item.title || "Untitled"}
                    {item.issueNumber ? ` #${item.issueNumber}` : ""}
                  </div>

                  <div className="comic-card-meta">{item.year || "Unknown"}</div>
                </div>
              )}

              <div className="comic-card-pills">
                {inCollection && (
                  <span className="pill pill-collection">In Collection</span>
                )}
                {inWishlist && (
                  <span className="pill pill-wishlist">On Wishlist</span>
                )}
              </div>

              {isUserAdded && (
                <div className="comic-card-actions">
                  {!inCollection && !inWishlist && (
                    <>
                      <button
                        className="comic-btn"
                        disabled={!user}
                        onClick={() => addToCollection(item.id, "owned")}
                      >
                        Add to Collection
                      </button>

                      <button
                        className="comic-btn"
                        disabled={!user}
                        onClick={() => addToCollection(item.id, "wishlist")}
                      >
                        Add to Wishlist
                      </button>
                    </>
                  )}

                  {inCollection && (
                    <button
                      className="comic-btn comic-btn-danger"
                      onClick={() => removeFromCollection(item.id)}
                    >
                      Remove from Collection
                    </button>
                  )}

                  {inWishlist && (
                    <button
                      className="comic-btn comic-btn-danger"
                      onClick={() => removeFromCollection(item.id)}
                    >
                      Remove from Wishlist
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {isLoading && <div className="empty-state">Loading…</div>}

      {hasMore && !isLoading && (
        <div style={{ marginTop: "20px", textAlign: "center" }}>
          <button
            className="comic-btn"
            onClick={() => setPage((p) => p + 1)}
          >
            Load More
          </button>
        </div>
      )}
    </section>
  );
}