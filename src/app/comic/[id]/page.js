"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import GradeEditor from "@/components/GradeEditor";

export default function ComicDetailPage() {
  const { id } = useParams();
  const { collections, collectionIds, wishlistIds, addToCollection, removeFromCollection } =
    useLibrary();
  const { user } = useAuth();
  const router = useRouter();

  const [comic, setComic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [gradeData, setGradeData] = useState(null);

  const inCollection = collectionIds?.has(String(id));
  const inWishlist = wishlistIds?.has(String(id));

  // Find the user_collections row for this comic so GradeEditor has an ID
  const collectionRow = collections?.find(
    (c) => c.comic_id != null && String(c.comic_id) === String(id)
  ) ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadComic() {
      setLoading(true);
      setNotFound(false);

      try {
        const res = await fetch(`/api/comics/${id}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json();
        const issue = data?.issue;
        if (!issue) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!cancelled) {
          setComic({
            id: issue.id,
            title: issue.series_title,
            issueNumber: issue.issue_number,
            year: issue.release_year,
            publisher: issue.publisher ?? null,
            created_by: issue.created_by ?? null,
            source: issue.source ?? "user",
            cover: issue.cover ?? null,
          });
        }
      } catch (err) {
        console.error("Comic detail load failed:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadComic();
    return () => { cancelled = true; };
  }, [id]);

  function handleShare() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  }

  if (loading) {
    return (
      <main className="page-wrapper">
        <div className="detail-layout">
          <div className="issue-cover-frame skeleton" style={{ aspectRatio: "2/3", borderRadius: 12 }} />
          <div className="metadata-column">
            <div className="skeleton" style={{ height: 36, width: "70%", borderRadius: 8, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 20, width: "40%", borderRadius: 8, marginBottom: 24 }} />
            <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !comic) {
    return (
      <main className="page-wrapper" style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ marginBottom: "1rem" }}>Comic not found</h1>
        <button className="add-comic-btn" onClick={() => router.push("/search")}>
          Back to Search
        </button>
      </main>
    );
  }

  const issueTitle = `${comic.title || "Untitled"}${comic.issueNumber ? ` #${comic.issueNumber}` : ""}`;

  return (
    <main className="page-wrapper">
      <section className="comic-panel">
        <div className="section-label badge-x">Issue</div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
          <div className="muted" style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <button className="link" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }} onClick={() => router.back()}>
              ← Back
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span className="pill">User Added</span>
            {inCollection && <span className="pill pill-collection">In Collection</span>}
            {inWishlist && <span className="pill pill-wishlist">On Wishlist</span>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: "28px", alignItems: "start", marginBottom: "28px" }}>
          {/* Cover column */}
          <div>
            <div className="issue-cover-frame">
              {comic.cover ? (
                <img src={comic.cover} alt={issueTitle} className="issue-cover-img" />
              ) : (
                <div className="issue-cover-img" style={{ background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: "0.85rem" }}>
                  No Cover
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "18px" }}>
              {!user && (
                <div className="muted">Sign in to save this to your library.</div>
              )}
              {user && !inCollection && !inWishlist && (
                <>
                  <button className="add-comic-btn" onClick={() => addToCollection(String(id), "owned")}>
                    Add to Collection
                  </button>
                  <button className="add-comic-btn" onClick={() => addToCollection(String(id), "wishlist")}>
                    Add to Wishlist
                  </button>
                </>
              )}
              {user && inCollection && (
                <button className="add-comic-btn" onClick={() => removeFromCollection(String(id))}>
                  Remove from Collection
                </button>
              )}
              {user && inWishlist && (
                <button className="add-comic-btn" onClick={() => removeFromCollection(String(id))}>
                  Remove from Wishlist
                </button>
              )}
              {user && comic.source === "user" && user.id === comic.created_by && (
                <button className="add-comic-btn" onClick={() => router.push(`/comic/${comic.id}/edit`)}>
                  Edit Comic
                </button>
              )}
              <button className="add-comic-btn" onClick={handleShare}>
                Copy Link
              </button>
            </div>
          </div>

          {/* Metadata column */}
          <div>
            <h1 className="hero-title" style={{ marginBottom: "10px" }}>{issueTitle}</h1>
            <p className="muted" style={{ marginBottom: "18px" }}>
              {comic.publisher || "Unknown Publisher"}
              {comic.year ? ` · ${comic.year}` : ""}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "18px", marginBottom: "22px" }}>
              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Issue Info</h3>
                <p><strong>Series:</strong> {comic.title || "—"}</p>
                <p><strong>Issue:</strong> {comic.issueNumber || "—"}</p>
                <p><strong>Publisher:</strong> {comic.publisher || "Unknown"}</p>
                <p><strong>Year:</strong> {comic.year || "—"}</p>
              </div>
            </div>

            {/* Grade editor — only shown when this comic is in the user's collection */}
            {user && inCollection && collectionRow?.id && (
              <div className="metadata-section" style={{ margin: 0, marginBottom: "22px" }}>
                <h3 className="issue-section-title">Condition & Grade</h3>
                <GradeEditor
                  collectionId={collectionRow.id}
                  initialData={{
                    grade_numeric: gradeData?.grade_numeric ?? collectionRow.grade_numeric ?? null,
                    condition: gradeData?.condition ?? collectionRow.condition ?? null,
                    slab_company: gradeData?.slab_company ?? collectionRow.slab_company ?? null,
                    slab_cert_number: gradeData?.slab_cert_number ?? collectionRow.slab_cert_number ?? null,
                    notes: gradeData?.notes ?? collectionRow.notes ?? null,
                  }}
                  onSave={(updated) => setGradeData((prev) => ({ ...prev, ...updated }))}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
