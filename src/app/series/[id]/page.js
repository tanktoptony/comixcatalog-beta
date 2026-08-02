"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";

function issueSortValue(issueNumber) {
  // Comics often store dual-numbered issues like "30 (471)" (Vol 2 / Vol 1
  // legacy numbering — Spider-Man, Fantastic Four, X-Men all do this), or
  // "1A", "1.MU", "300.1". A naive Number() returns NaN on these and shoves
  // them to the end. Extract the leading numeric portion so they sort by
  // their primary issue number.
  const raw = String(issueNumber ?? "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;

  const num = Number(raw);
  if (!Number.isNaN(num)) return num;

  const match = raw.match(/^(-?\d+(\.\d+)?)/);
  if (match) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Number.MAX_SAFE_INTEGER;
}

export default function SeriesPage() {
  const { id } = useParams();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState("issue-asc");

  const { user, isPro } = useAuth();
  const { collectionIds, wishlistIds, addToCollection } = useLibrary();
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  useEffect(() => {
    if (!id) return;

    async function loadSeries() {
      setLoading(true);

      try {
        const res = await fetch(`/api/series/${id}`, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok || !data?.series) {
          setSeries(null);
          return;
        }

        setSeries(data.series);
      } catch (err) {
        console.error("Series page load failed:", err);
        setSeries(null);
      } finally {
        setLoading(false);
      }
    }

    loadSeries();
  }, [id]);

  const sortedIssues = useMemo(() => {
    if (!series?.issues) return [];

    const issues = [...series.issues];

    if (sortMode === "issue-desc") {
        issues.sort(
        (a, b) => issueSortValue(b.issue_number) - issueSortValue(a.issue_number)
        );
    } else if (sortMode === "year-asc") {
        issues.sort((a, b) => (a.release_year ?? 0) - (b.release_year ?? 0));
    } else if (sortMode === "year-desc") {
        issues.sort((a, b) => (b.release_year ?? 0) - (a.release_year ?? 0));
    } else {
        issues.sort(
        (a, b) => issueSortValue(a.issue_number) - issueSortValue(b.issue_number)
        );
    }

    const deduped = [];
    const seen = new Set();

    for (const issue of issues) {
        const key = String(issue?.issue_number ?? "").trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(issue);
    }

    return deduped;
    }, [series, sortMode]);

  // Run completion math. issue.id is already the library key
  // ("gcd-<gcd_id>" for GCD issues, plain uuid for local user comics) — same
  // shape LibraryContext stores in collectionIds / wishlistIds.
  const runStats = useMemo(() => {
    if (!sortedIssues.length) return { owned: 0, wishlisted: 0, total: 0, missing: [] };
    let owned = 0;
    let wishlisted = 0;
    const missing = [];
    for (const issue of sortedIssues) {
      const key = String(issue?.id ?? "");
      if (!key) continue;
      if (collectionIds?.has(key)) owned += 1;
      else if (wishlistIds?.has(key)) wishlisted += 1;
      else missing.push(issue);
    }
    return { owned, wishlisted, total: sortedIssues.length, missing };
  }, [sortedIssues, collectionIds, wishlistIds]);

  const runPct = runStats.total > 0 ? Math.round((runStats.owned / runStats.total) * 100) : 0;

  async function handleAddAllMissingToWantlist() {
    if (!user?.id || !isPro || runStats.missing.length === 0) return;
    // Long runs (1000+ Action Comics, 700+ Spider-Man) can blow up the
    // optimistic-state churn. Confirm first for >50.
    if (runStats.missing.length > 50) {
      const ok = window.confirm(
        `You're about to add ${runStats.missing.length} issues to your wantlist. This may take a moment. Continue?`
      );
      if (!ok) return;
    }
    setBulkAdding(true);
    setBulkResult(null);
    let added = 0;
    let failed = 0;
    for (const issue of runStats.missing) {
      try {
        await addToCollection(String(issue.id), "wishlist");
        added += 1;
      } catch (err) {
        console.error("Run-completion bulk add failed for", issue.id, err);
        failed += 1;
      }
    }
    setBulkAdding(false);
    setBulkResult({ added, failed });
  }

  if (loading) {
    return (
      <main className="page-wrapper">
        <p>Loading…</p>
      </main>
    );
  }

  if (!series) {
    return (
      <main className="page-wrapper">
        <p>Series not found.</p>
      </main>
    );
  }

  const yearLabel =
    series.year_start && series.year_end
      ? series.year_start === series.year_end
        ? `${series.year_start}`
        : `${series.year_start}–${series.year_end}`
      : "Year unknown";

  return (
    <main className="page-wrapper">
      <section className="comic-panel">
        <div className="section-label badge-x">Series</div>

        <div
          style={{
            display: "grid",
            // Same auto-fit pattern as the issue page hero — collapses to
            // a single column under ~520px so phones don't horizontal-scroll.
            gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
            gap: "24px",
            alignItems: "start",
            marginBottom: "28px",
          }}
        >
          <div className="issue-cover-frame" style={{ maxWidth: 220 }}>
            <img
              src={series.featured_cover || "/fallback-cover.png"}
              alt={series.title}
              className="issue-cover-img"
            />
          </div>

          <div>
            <h1 className="hero-title" style={{ marginBottom: "10px" }}>
              {series.title}
            </h1>

            <p className="muted" style={{ marginBottom: "16px" }}>
              {series.publisher} · {series.issue_count} issue
              {series.issue_count === 1 ? "" : "s"} · {yearLabel}
            </p>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "16px",
              }}
            >
              <span className="pill">Series Page</span>
              <span className="pill">Canonical Run</span>
            </div>

            <p className="muted" style={{ maxWidth: "760px" }}>
              Browse the run, jump into exact issues, and eventually compare copies
              for sale tied to the canonical issue page.
            </p>
          </div>
        </div>


        {/* ── Run completion ────────────────────────────────────────────
            Only render when the viewer is signed in and there's at least one
            owned/wishlisted issue from this run — otherwise it's noise on
            series the user has no relationship to. */}
        {user && sortedIssues.length > 0 && (runStats.owned > 0 || runStats.wishlisted > 0) && (
          <div
            style={{
              marginBottom: 20,
              padding: "14px 16px",
              borderRadius: 10,
              background: "rgba(255,215,0,0.06)",
              border: "1px solid rgba(255,215,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                Run completion: you own {runStats.owned} of {runStats.total}
                {runStats.wishlisted > 0 && (
                  <span style={{ opacity: 0.7, fontWeight: 500 }}>
                    {" "}· {runStats.wishlisted} on wantlist
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 700, color: "var(--cc-gold, #FFD700)" }}>
                {runPct}%
              </div>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
                marginBottom: runStats.missing.length > 0 ? 12 : 0,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${runPct}%`,
                  background:
                    runPct === 100
                      ? "linear-gradient(90deg, #FFD700, #FFC400)"
                      : "linear-gradient(90deg, #4CAF50, #2196F3)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            {runStats.missing.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: "0.9rem", opacity: 0.85 }}>
                  Missing {runStats.missing.length} issue{runStats.missing.length === 1 ? "" : "s"}.
                  {!isPro && (
                    <span style={{ opacity: 0.7 }}>
                      {" "}Upgrade to add them all to your wantlist in one click.
                    </span>
                  )}
                </div>
                {isPro ? (
                  <button
                    type="button"
                    onClick={handleAddAllMissingToWantlist}
                    disabled={bulkAdding}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid rgba(76,175,80,0.4)",
                      background: "linear-gradient(90deg, #4CAF50, #2196F3)",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: bulkAdding ? "not-allowed" : "pointer",
                      opacity: bulkAdding ? 0.7 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {bulkAdding
                      ? `Adding… (${runStats.missing.length})`
                      : `+ Add all ${runStats.missing.length} to wantlist`}
                  </button>
                ) : (
                  <Link
                    href="/upgrade"
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--cc-gold, #FFD700)",
                      color: "var(--cc-gold, #FFD700)",
                      fontWeight: 700,
                      textDecoration: "none",
                      flexShrink: 0,
                    }}
                  >
                    See Pro membership options →
                  </Link>
                )}
              </div>
            )}
            {bulkResult && (
              <div style={{ marginTop: 8, fontSize: "0.85rem", opacity: 0.85 }}>
                ✓ Added {bulkResult.added} to your wantlist
                {bulkResult.failed > 0 && ` (${bulkResult.failed} failed)`}.
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          <div className="muted">
            {sortedIssues.length} issue{sortedIssues.length === 1 ? "" : "s"}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="sortMode" className="muted">
              Sort
            </label>
            <select
              id="sortMode"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              className="input"
              style={{ width: 180 }}
            >
              <option value="issue-asc">Issue # ascending</option>
              <option value="issue-desc">Issue # descending</option>
              <option value="year-asc">Year ascending</option>
              <option value="year-desc">Year descending</option>
            </select>
          </div>
        </div>

        {sortedIssues.length === 0 ? (
          <div className="empty-state">
            This series does not have canonical issue data available.
          </div>
        ) : (
          <div className="comic-grid">
            {sortedIssues.map((issue) => {
              const key = String(issue?.id ?? "");
              const isOwned = collectionIds?.has(key);
              const isWanted = !isOwned && wishlistIds?.has(key);
              return (
              <article key={issue.id} className="comic-card">
                <Link href={`/issue/${issue.id}`} className="card-link">
                  <div className="comic-card-cover" style={{ position: "relative" }}>
                    <img
                      src={issue.cover || "/fallback-cover.png"}
                      alt={`${series.title} #${issue.issue_number}`}
                      loading="lazy"
                    />
                    {isOwned && (
                      <span
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          padding: "2px 7px",
                          borderRadius: 999,
                          fontSize: "0.65rem",
                          fontWeight: 800,
                          background: "linear-gradient(90deg, #4CAF50, #2196F3)",
                          color: "#fff",
                          letterSpacing: "0.04em",
                        }}
                      >
                        OWNED
                      </span>
                    )}
                    {isWanted && (
                      <span
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          padding: "2px 7px",
                          borderRadius: 999,
                          fontSize: "0.65rem",
                          fontWeight: 800,
                          background: "rgba(255,255,255,0.18)",
                          color: "#fff",
                          letterSpacing: "0.04em",
                        }}
                      >
                        WANTLIST
                      </span>
                    )}
                  </div>

                  <div className="comic-card-title">
                    {series.title}
                    {issue.issue_number ? ` #${issue.issue_number}` : ""}
                  </div>

                  {issue.title && issue.title !== series.title && (
                    <div className="comic-card-meta" style={{ marginBottom: 4 }}>
                      {issue.title}
                    </div>
                  )}

                  <div className="comic-card-meta">
                    {issue.release_year || "Unknown Year"}
                  </div>
                </Link>
              </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
