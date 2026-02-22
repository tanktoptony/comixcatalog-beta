"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import CollectionStats from "@/components/CollectionStats";

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
  const supabase = getSupabaseClient();
  const [csvResult, setCsvResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

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

    // Optimistically update local collections
    item.status = newStatus;
  }

  /**
   * Load Supabase comics ONCE
   */
  useEffect(() => {
    async function loadComics() {
      try {
        const res = await fetch("/api/comics");
        const json = await res.json();

        const mapped = (json.comics || []).map(mapSupabaseComic);

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
      <CollectionStats collections={collections} />

      <div className ="library-actions">
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
        className="file-upload"
        style={{ marginBottom: "1rem" }}
      >
        <label
          className={`add-comic-btn ${selectedFile ? "csv-ready" : ""}`}
        >
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

        <button type="submit" className="add-comic-btn">
          Upload CSV
        </button>
      </form>

        {csvResult && (
          <div
            style={{
              marginBottom: "1.5rem",
              padding: "16px",
              background: "rgba(15,23,42,0.85)",
              border: "1px solid #334155",
              borderRadius: "12px",
            }}
          >
            <strong>Import Summary:</strong>

            <div style={{ marginTop: 8, fontSize: "0.85rem" }}>
              <div>Created: {csvResult.created}</div>
              <div>Reused: {csvResult.reused}</div>
              <div>Skipped: {csvResult.skipped}</div>
            </div>

            {csvResult.errors?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: "#ff6b6b" }}>
                  Errors ({csvResult.errors.length})
                </strong>

                <ul style={{ marginTop: 6, fontSize: "0.8rem" }}>
                  {csvResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>

                {csvResult.errors.length > 5 && (
                  <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                    Showing first 5 errors…
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      <div className="comic-grid">
        {visible.map((item, index) => {
          const comic = comicIndex[String(item.comic_id)];
          if (!comic) return null;

          return (
            <div
              key={`${item.comic_id}-${item.status}-${index}`}
              className="comic-card"
            >
              <Link href={`/comic/${item.comic_id}`}>
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

                <div className="comic-card-meta">
                  {comic.year || "Unknown"}
                </div>
              </Link>

              {tab === "owned" && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => toggleForSale(item)}
                    className="add-comic-btn"
                  >
                    {item.status === "for_sale"
                      ? "Remove From Sale"
                      : "Mark For Sale"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}