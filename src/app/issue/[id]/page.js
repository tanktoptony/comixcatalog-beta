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

  const { user } = useAuth();
  const libraryId = String(issue?.id || id || "");

  const inCollection = collectionIds?.has(libraryId);
  const inWishlist = wishlistIds?.has(libraryId);

  useEffect(() => {
    if (!id) return;

    async function loadIssue() {
      setLoading(true);

      try {
        // Pass viewer id so the API can compute per-arc ownership counts for
        // the "Part of [Arc Name] — you own X of Y" badge.
        const userParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
        const res = await fetch(`/api/issues/${id}${userParam}`, { cache: "no-store" });
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
  }, [id, user?.id]);

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

        {/* ── Story-arc membership badges ──────────────────────────────
            For each arc this issue belongs to, show name + ownership
            progress + click-through to the arc completion page. Most
            issues will be in zero arcs; a few notable books are in
            multiple (e.g. cross-event tie-ins). */}
        {issue.arcs && issue.arcs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {issue.arcs.map((arc) => (
              <Link
                key={arc.id}
                href={arc.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(255,215,0,0.06)",
                  border: "1px solid rgba(255,215,0,0.25)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {arc.image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={arc.image_url}
                    alt=""
                    style={{ width: 40, height: 60, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.7,
                    }}
                  >
                    Part of Story Arc
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "1rem", marginTop: 2 }}>
                    {arc.name}
                  </div>
                  <div style={{ fontSize: "0.85rem", opacity: 0.85, marginTop: 2 }}>
                    {user
                      ? `You own ${arc.owned} of ${arc.total}${arc.owned === arc.total && arc.total > 0 ? " — complete!" : ""}`
                      : `${arc.total} issue${arc.total === 1 ? "" : "s"} — sign in to track completion`}
                  </div>
                </div>
                <div style={{ color: "var(--cc-gold, #FFD700)", fontWeight: 700, fontSize: "1.2rem" }}>→</div>
              </Link>
            ))}
          </div>
        )}

        <div
          style={{
            display: "grid",
            // auto-fit with minmax(280px, ...) gives us a 2-col layout on
            // desktop and stacks to 1 col under ~600px (cover + info fit in
            // a phone viewport instead of forcing horizontal scroll).
            gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
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
                    onClick={() => addToCollection(libraryId, "owned")}
                  >
                    Add to Collection
                  </button>

                  <button
                    className="add-comic-btn"
                    onClick={() => addToCollection(libraryId, "wishlist")}
                  >
                    Add to Wishlist
                  </button>
                </>
              )}

              {user && inCollection && (
                <button
                  className="add-comic-btn"
                  onClick={() => removeFromCollection(libraryId)}
                >
                  Remove from Collection
                </button>
              )}

              {user && inWishlist && (
                <button
                  className="add-comic-btn"
                  onClick={() => removeFromCollection(libraryId)}
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
              {/* display_date is the API's canonical English "Month YYYY"
                  rendering, derived from key_date. Replaces the redundant
                  release_year + raw publication_date pair that used to leak
                  foreign-language month names (e.g. "septembre 2008"). */}
              {issue.display_date ? ` · ${issue.display_date}` : ""}
            </p>

            <div
              style={{
                display: "grid",
                // Listings/Median/Low-High stat cards — collapse to fewer
                // columns on narrow phones rather than squeezing.
                gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
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
                // Issue Info + Quick Actions — stack under ~520px.
                gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
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
                  <button
                    className="add-comic-btn"
                    onClick={() => {
                      if (navigator.clipboard) navigator.clipboard.writeText(window.location.href);
                    }}
                  >
                    Copy Link
                  </button>
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
                      // Marketplace listings header — keeps 4 columns on
                      // anything ~480+, otherwise wraps. Buyers on mobile see
                      // the columns reflow not horizontally scroll.
                      gridTemplateColumns: "repeat(auto-fit, minmax(min(110px, 100%), 1fr))",
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
                    // Nearby Issues thumbnails — 4-up on desktop, 2-up on
                    // mobile (covers stay legible at ~140px min).
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))",
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