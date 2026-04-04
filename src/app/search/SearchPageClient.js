"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useLibrary } from "../../context/LibraryContext";
import { useAuth } from "@/context/AuthContext";

/**
 * Normalize API comics into a search-safe shape
 */
function mapSupabaseComic(row) {
  return {
    id: row.id,
    title: row.series_title ?? row.title ?? null,
    issueNumber: row.issue_number,
    year: row.release_year,
    publisher: row.publisher || null,
    cover: row.cover_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${row.cover_path}`
      : null,
    __source: row.__source || "user",
  };
}

export default function SearchPageClient() {
  const [publisherFilter, setPublisherFilter] = useState(null);
  const [yearRange, setYearRange] = useState(null);
  const [collectionFilter, setCollectionFilter] = useState("all");
  // "all" | "collection" | "wishlist"

  const [query, setQuery] = useState("");
  const [supabaseComics, setSupabaseComics] = useState([]);
  const [page, setPage] = useState(0);
  const [seriesResults, setSeriesResults] = useState([]);
  const [isBrowsing, setIsBrowsing] = useState(true);

  const { wishlistIds, collectionIds, addToCollection, removeFromCollection } =
    useLibrary();

  const { user } = useAuth();

  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        let url;

        if (!query) {
          setIsBrowsing(true);
          url = `/api/comics?limit=100&offset=${page * 100}`;
        } else {
          setIsBrowsing(false);
          url = `/api/search/comics?q=${encodeURIComponent(query)}&limit=100&offset=${page * 100}`;
        }

        const res = await fetch(url);
        const data = await res.json();

        setSupabaseComics((prev) => {
          if (page === 0) return data.comics || [];
          return [...prev, ...(data.comics || [])];
        });
      } catch (err) {
        console.error("Load failed", err);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [query, page]);

  useEffect(() => {
    setPage(0);
    setSupabaseComics([]);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setSeriesResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/series?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSeriesResults(data.series || []);
      } catch (err) {
        console.error("Series search failed", err);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [query]);

  const results = useMemo(() => {
    const mappedSupabase = supabaseComics
      .filter(Boolean)
      .map(mapSupabaseComic)
      .filter(Boolean);

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

    return filtered.filter(Boolean);
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
            {seriesResults.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="comic-card"
              >
                <div className="comic-card-title">{s.title}</div>
                <div className="comic-card-meta">
                  {s.publisher?.name || "Unknown Publisher"}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="filter-bar">
        {["Marvel", "DC", "Image", "Dark Horse", "Boom", "IDW", "Evil Ink", "Vertigo"].map((pub) => (
          <button
            key={pub}
            className={`filter-btn ${publisherFilter === pub ? "active" : ""}`}
            onClick={() =>
              setPublisherFilter(
                publisherFilter === pub ? null : pub
              )
            }
          >
            {pub}
          </button>
        ))}

        <button
          className={`filter-btn ${
            collectionFilter === "collection" ? "active" : ""
          }`}
          onClick={() =>
            setCollectionFilter(
              collectionFilter === "collection" ? "all" : "collection"
            )
          }
        >
          In My Collection
        </button>

        <button
          className={`filter-btn ${
            collectionFilter === "wishlist" ? "active" : ""
          }`}
          onClick={() =>
            setCollectionFilter(
              collectionFilter === "wishlist" ? "all" : "wishlist"
            )
          }
        >
          Wishlist
        </button>
      </div>

      <p className="muted">
        {results.length} result{results.length === 1 ? "" : "s"} found
        {query && ` for “${query}”`}
      </p>

      {results.length === 0 && (
        <div className="empty-state">No comics match your search yet.</div>
      )}

      <div className="comic-grid">
        {results.map((item) => {
          const inCollection = collectionIds.has(item.id);
          const inWishlist = wishlistIds.has(item.id);
          const isUserAdded = item.__source === "user";
          const coverSrc = item.cover || "/fallback-cover.png";

          return (
            <article key={item.id} className="comic-card">
              <Link href={`/comic/${item.id}`} className="card-link">
                <div className="comic-card-cover">
                  <img src={coverSrc} alt={item.title || "Comic cover"} loading="lazy" />
                </div>

                <div className="comic-card-title">
                  {item.title}
                  {item.issueNumber ? ` #${item.issueNumber}` : ""}
                </div>

                <div className="comic-card-meta">{item.year || "Unknown"}</div>

                {isUserAdded && (
                  <span className="pill pill-new">User Added</span>
                )}
              </Link>

              <div className="comic-card-pills">
                {inCollection && (
                  <span className="pill pill-collection">In Collection</span>
                )}
                {inWishlist && (
                  <span className="pill pill-wishlist">On Wishlist</span>
                )}
              </div>

              {item.__source === "user" && (
                <div className="comic-card-actions">
                  {!collectionIds.has(item.id) && !wishlistIds.has(item.id) && (
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

                  {collectionIds.has(item.id) && (
                    <button
                      className="comic-btn comic-btn-danger"
                      onClick={() => removeFromCollection(item.id)}
                    >
                      Remove from Collection
                    </button>
                  )}

                  {wishlistIds.has(item.id) && (
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

      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <button
          className="comic-btn"
          onClick={() => setPage((p) => p + 1)}
        >
          Load More
        </button>
      </div>
    </section>
  );
}