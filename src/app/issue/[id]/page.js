"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";

function money(value) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

export default function IssuePage() {
  const { id } = useParams();
  const { collectionIds, wishlistIds, addToCollection, removeFromCollection } =
    useLibrary();

  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);

  const inCollection = collectionIds?.has(String(id));
  const inWishlist = wishlistIds?.has(String(id));

  const { user } = useAuth();

  useEffect(() => {
    if (!id) return;

    async function loadIssue() {
      setLoading(true);

      try {
        const res = await fetch(`/api/issues/${id}`, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok || !data?.issue) {
          setIssue(null);
          return;
        }

        setIssue(data.issue);
      } catch (err) {
        console.error("Issue page load failed:", err);
        setIssue(null);
      } finally {
        setLoading(false);
      }
    }

    loadIssue();
  }, [id]);

  const issueTitle = useMemo(() => {
    if (!issue) return "";
    return `${issue.series_title}${issue.issue_number ? ` #${issue.issue_number}` : ""}`;
  }, [issue]);

  if (loading) {
    return (
      <main className="page-wrapper">
        <section className="comic-panel">
          <p>Loading…</p>
        </section>
      </main>
    );
  }

  if (!issue) {
    return (
      <main className="page-wrapper">
        <section className="comic-panel">
          <p>Issue not found.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-wrapper">
      <section className="comic-panel">
        <div className="section-label badge-x">Issue</div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "18px",
          }}
        >
          <div className="muted" style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <Link href="/search" className="link">
              ← Back to Search
            </Link>

            {issue.series_id && (
              <Link href={`/series/${issue.series_id}`} className="link">
                Back to Series
              </Link>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <span className="pill">
              {issue.source === "gcd" ? "Canonical Issue" : "User Added"}
            </span>
            {inCollection && (
              <span className="pill pill-collection">In Collection</span>
            )}
            {inWishlist && (
              <span className="pill pill-wishlist">On Wishlist</span>
            )}
          </div>
        </div>

        {(issue.prev_issue || issue.next_issue) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "20px",
            }}
          >
            <div>
              {issue.prev_issue ? (
                <Link href={`/issue/${issue.prev_issue.id}`} className="link">
                  ← {issue.series_title} #{issue.prev_issue.issue_number}
                </Link>
              ) : (
                <span className="muted">← No previous issue</span>
              )}
            </div>

            <div>
              {issue.next_issue ? (
                <Link href={`/issue/${issue.next_issue.id}`} className="link">
                  {issue.series_title} #{issue.next_issue.issue_number} →
                </Link>
              ) : (
                <span className="muted">No next issue →</span>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px minmax(0, 1fr)",
            gap: "28px",
            alignItems: "start",
            marginBottom: "28px",
          }}
        >
          <div>
            <div className="issue-cover-frame">
              <img
                src={issue.cover || "/fallback-cover.png"}
                alt={issueTitle}
                className="issue-cover-img"
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              {!user && (
                <div className="muted">Sign in to save this issue to your library.</div>
              )}

              {user && !inCollection && !inWishlist && (
                <>
                  <button
                    className="add-comic-btn"
                    onClick={() => addToCollection(String(issue.id), "owned")}
                  >
                    Add to Collection
                  </button>

                  <button
                    className="add-comic-btn"
                    onClick={() => addToCollection(String(issue.id), "wishlist")}
                  >
                    Add to Wishlist
                  </button>
                </>
              )}

              {user && inCollection && (
                <button
                  className="add-comic-btn"
                  onClick={() => removeFromCollection(String(issue.id))}
                >
                  Remove from Collection
                </button>
              )}

              {user && inWishlist && (
                <button
                  className="add-comic-btn"
                  onClick={() => removeFromCollection(String(issue.id))}
                >
                  Remove from Wishlist
                </button>
              )}
            </div>
          </div>

          <div>
            <h1 className="hero-title" style={{ marginBottom: "10px" }}>
              {issueTitle}
            </h1>

            <p className="muted" style={{ marginBottom: "18px" }}>
              {issue.publisher || "Unknown Publisher"}
              {issue.release_year ? ` · ${issue.release_year}` : ""}
              {issue.publication_date ? ` · ${issue.publication_date}` : ""}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "12px",
                marginBottom: "22px",
              }}
            >
              <div className="metadata-section" style={{ margin: 0 }}>
                <div className="issue-section-title">Listings</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                  {issue.market?.listings_count ?? 0}
                </div>
              </div>

              <div className="metadata-section" style={{ margin: 0 }}>
                <div className="issue-section-title">Median</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>
                  {money(issue.market?.median)}
                </div>
              </div>

              <div className="metadata-section" style={{ margin: 0 }}>
                <div className="issue-section-title">Low / High</div>
                <div style={{ fontSize: "1rem", fontWeight: 700 }}>
                  {money(issue.market?.low)} / {money(issue.market?.high)}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: "18px",
                marginBottom: "22px",
              }}
            >
              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Issue Info</h3>

                <p><strong>Series:</strong> {issue.series_title}</p>
                <p><strong>Issue:</strong> {issue.issue_number ?? "TBD"}</p>
                <p><strong>Publisher:</strong> {issue.publisher || "Unknown"}</p>
                <p><strong>Year:</strong> {issue.release_year || "Unknown"}</p>
                <p>
                  <strong>Source:</strong>{" "}
                  {issue.source === "gcd" ? "Canonical Database" : "User Added"}
                </p>
              </div>

              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Quick Actions</h3>

                <div style={{ display: "grid", gap: "10px" }}>
                  <button className="add-comic-btn">Sell a Copy</button>
                  <button className="add-comic-btn">Track Market Value</button>
                  <button className="add-comic-btn">Share Issue</button>
                </div>
              </div>
            </div>

            <div className="metadata-section" style={{ margin: 0, marginBottom: "22px" }}>
              <h3 className="issue-section-title">Copies for Sale</h3>

              {(issue.market?.listings_count ?? 0) === 0 ? (
                <div className="empty-state" style={{ marginTop: "12px" }}>
                  No copies listed yet.
                </div>
              ) : (
                <div
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    marginTop: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.3fr 0.9fr 0.7fr 0.7fr",
                      gap: "12px",
                      padding: "12px 14px",
                      fontWeight: 700,
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div>Seller</div>
                    <div>Condition</div>
                    <div>Price</div>
                    <div>Shipping</div>
                  </div>

                  <div style={{ padding: "16px 14px" }} className="muted">
                    Listing rows will land here once marketplace data is tied to canonical issue ids.
                  </div>
                </div>
              )}
            </div>

            {issue.related_issues?.length > 0 && (
              <div className="metadata-section" style={{ margin: 0 }}>
                <h3 className="issue-section-title">Nearby Issues</h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "12px",
                    marginTop: "12px",
                  }}
                >
                  {issue.related_issues.map((related) => (
                    <Link
                      key={related.id}
                      href={`/issue/${related.id}`}
                      className="comic-card"
                      style={{ textDecoration: "none" }}
                    >
                      <div className="comic-card-title">
                        {issue.series_title} #{related.issue_number}
                      </div>

                      {related.title && (
                        <div className="comic-card-meta" style={{ marginBottom: 4 }}>
                          {related.title}
                        </div>
                      )}

                      <div className="comic-card-meta">
                        {related.release_year || "Unknown Year"}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}