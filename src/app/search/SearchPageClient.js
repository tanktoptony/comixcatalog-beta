"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useLibrary } from "../../context/LibraryContext";
import { MOCK_ITEMS } from "@/data/mockCatalog";
import { useAuth } from "@/context/AuthContext";

/**
 * Normalize Supabase comics into a search-safe shape
 */
function mapSupabaseComic(row) {
  return {
    id: row.id,
    title: row.series_title,
    issueNumber: row.issue_number,
    year: row.release_year,
    cover: row.cover_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${row.cover_path}`
      : null,
    __source: "supabase",
  };
}

function normalizeMockComic(item) {
  return {
    ...item,
    cover: item.cover
      ? `/covers/${item.cover}` // public/covers/*.jpg
      : null,
    __source: "mock",
  };
}

export default function SearchPageClient() {
  const [query, setQuery] = useState("");
  const [supabaseComics, setSupabaseComics] = useState([]);

  const { wishlistIds, collectionIds, addToCollection, removeFromCollection } =
    useLibrary();

  const { user, loading: authLoading } = useAuth();
  /**
   * Load Supabase comics once
   */
  useEffect(() => {
    async function loadSupabaseComics() {
      try {
        const res = await fetch("/api/comics");
        const data = await res.json();
        setSupabaseComics(data.comics || []);
      } catch (err) {
        console.error("Failed to load Supabase comics", err);
      }
    }

    loadSupabaseComics();
  }, []);

  /**
   * Merge mock + Supabase results
   */
  const results = useMemo(() => {
    const mappedSupabase = supabaseComics.map(mapSupabaseComic);
    const mappedMocks = MOCK_ITEMS.map(normalizeMockComic);
    const combined = [...mappedMocks, ...mappedSupabase];

    if (!query) return combined;

    const q = query.toLowerCase();
    return combined.filter(
      (item) =>
        item.title?.toLowerCase().includes(q) ||
        item.series?.toLowerCase().includes(q)
    );
  }, [query, supabaseComics]);

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
          const isSupabase = item.__source === "supabase";

          const coverSrc = item.cover || "/fallback-cover.png";

          return (
            <article key={item.id} className="comic-card">
              <Link href={`/comic/${item.id}`} className="card-link">
                <div className="comic-card-cover">
                  <img src={coverSrc} alt={item.title} loading="lazy" />
                </div>

                <div className="comic-card-title">
                  {item.title}
                  {item.issueNumber ? ` #${item.issueNumber}` : ""}
                </div>

                <div className="comic-card-meta">{item.year || "Unknown"}</div>

                {isSupabase && (
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

              {item.__source === "supabase" && (
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
    </section>
  );
}
