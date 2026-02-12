"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function ComicDetailPage() {
  const { id } = useParams();
  const { collectionIds, wishlistIds, addToCollection, removeFromCollection } =
    useLibrary();

  const [comic, setComic] = useState(null);
  const [loading, setLoading] = useState(true);

  const inCollection = collectionIds?.has(String(id));
  const inWishlist = wishlistIds?.has(String(id));

  const { user } = useAuth();

  const router = useRouter();

  console.log("USER:", user);
  console.log("COMIC UPLOADED BY:", comic?.created_by);


  useEffect(() => {
    if (!id) return;

    async function loadComic() {
      setLoading(true);

      // ===============================
      // SUPABASE COMICS — SAME AS SEARCH
      // ===============================
      const res = await fetch("/api/comics");
      const data = await res.json();

      const found = data.comics?.find((c) => String(c.id) === String(id));

      if (!found) {
        setComic(null);
        setLoading(false);
        return;
      }

      setComic({
        id: found.id,
        title: found.series_title,
        issueNumber: found.issue_number,
        year: found.release_year,
        created_by: found.created_by,
        cover: found.cover_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${found.cover_path}`
          : null,
      });

      setLoading(false);
    }

    loadComic();
  }, [id]);

  if (loading) return <p>Loading…</p>;
  if (!comic) return <p>Comic not found.</p>;

  return (
    <main className="page-wrapper">
      <div className="detail-layout">
        
        {/* LEFT COLUMN */}
        <div>
          <div className="issue-hero">
            <div className="issue-cover-frame">
              {comic.cover && (
                <img
                  src={comic.cover}
                  alt={comic.title}
                  className="issue-cover-img"
                />
              )}
            </div>
          </div>

          <div className="issue-status-row">
            {inCollection && (
              <span className="pill pill-collection">In Collection</span>
            )}
            {inWishlist && (
              <span className="pill pill-wishlist">On Wishlist</span>
            )}
          </div>

          <div className="issue-actions">
            {!inCollection && !inWishlist && (
              <>
                <button
                  className="add-comic-btn"
                  onClick={() => addToCollection(String(id), "owned")}
                >
                  Add to Collection
                </button>

                <button
                  className="add-comic-btn"
                  onClick={() => addToCollection(String(id), "wishlist")}
                >
                  Add to Wishlist
                </button>
              </>
            )}

            {user && user.id === comic.created_by && (
              <button
                className="add-comic-btn"
                onClick={() => router.push(`/comic/${comic.id}/edit`)}
              >
                Edit Comic
              </button>
            )}

            {(inCollection || inWishlist) && (
              <button
                className="add-comic-btn"
                onClick={() => removeFromCollection(String(id))}
              >
                Remove from Library
              </button>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="metadata-column">
          <h1 className="landing-title">
            {comic.title}
            {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
          </h1>

          <p className="landing-subtitle">
            {comic.year || "Unknown Year"}
          </p>

          <div className="metadata-section">
            <h3 className="issue-section-title">Issue Info</h3>

            <p><strong>Series:</strong> {comic.title}</p>
            <p><strong>Issue:</strong> {comic.issueNumber}</p>
            <p><strong>Year:</strong> {comic.year || "TBD"}</p>
          </div>

          <div className="metadata-section">
            <h3 className="issue-section-title">Collector Condition</h3>

            <div className="condition-grid">
              <div className="condition-input">
                <span>Cover / Gloss</span>
                <input type="range" min="0" max="10" />
              </div>

              <div className="condition-input">
                <span>Spine / Corners</span>
                <input type="range" min="0" max="10" />
              </div>

              <div className="condition-input">
                <span>Pages</span>
                <input type="range" min="0" max="10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

  );
}