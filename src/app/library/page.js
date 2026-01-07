"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";


/**
 * Normalize Supabase comics the same way Search does
 */
function mapSupabaseComic(row) {
  return {
    id: String(row.id),
    title: row.series_title,
    issueNumber: row.issue_number,
    year: row.release_year,
    cover: row.cover_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${row.cover_path}`
      : null,
  };
}

export default function LibraryPage() {
  const [tab, setTab] = useState("owned");
  const { collections, loading } = useLibrary();
  const [comicIndex, setComicIndex] = useState({});
  const { user } = useAuth();


  /**
   * Load Supabase comics ONCE
   */
  useEffect(() => {
    async function loadComics() {
      try {
        const res = await fetch("/api/comics");
        const json = await res.json();

        const mapped = (json.comics || []).map(mapSupabaseComic);

        // build lookup: comicId -> comic
        const index = {};
        for (const c of mapped) {
          index[c.id] = c;
        }

        setComicIndex(index);
      } catch (err) {
        console.error("Failed to load comics", err);
      }
    }

    loadComics();
  }, []);

  const visible = useMemo(
    () => collections.filter((c) => c.status === tab),
    [collections, tab]
  );

  return (
    <main style={{ padding: "2rem" }}>
      <h1>My Library</h1>

      <div
        style={{ marginBottom: "1rem", display: "flex", alignItems: "center" }}
      >
        <button className="add-comic-btn" onClick={() => setTab("owned")}>
          Collection
        </button>
        <button
          className="add-comic-btn"
          onClick={() => setTab("wishlist")}
          style={{ marginLeft: 8 }}
        >
          Wishlist
        </button>

        {user && (
          <Link
            href="/library/add"
            className="add-comic-btn"
            style={{ marginLeft: 8 }}
          >
            ➕ Add New Comic
          </Link>
        )}
      </div>

      {loading && <p>Loading…</p>}
      {!loading && visible.length === 0 && <p>No comics yet.</p>}

      <div className="comic-grid">
        {visible.map((item, index) => {
          const comic = comicIndex[String(item.comic_id)];

          if (!comic) return null;

          return (
            <Link
              key={`${item.comic_id}-${item.status}-${index}`}
              href={`/comic/${item.comic_id}`}
              className="comic-card"
            >
              <div className="comic-card-cover">
                <img
                  src={comic.cover || "/fallback-cover.png"}
                  alt={comic.title}
                />
              </div>

              <div className="comic-card-title">
                {comic.title}
                {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
              </div>

              <div className="comic-card-meta">{comic.year || "Unknown"}</div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
