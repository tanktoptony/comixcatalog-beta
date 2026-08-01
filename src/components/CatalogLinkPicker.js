"use client";

// CatalogLinkPicker — Pro-only modal for matching one local-only library
// row to a specific GCD catalog entry.
//
// Two-stage flow (Phase 2.1, "series-first"):
//
//   Stage 1 — SERIES PICK
//     Show all series whose title matches the search query (broad ILIKE,
//     no issue # filter). Each card shows year span, publisher, issue
//     count, sample cover. Series that contain the user's hinted issue #
//     get a "✓ Has issue #N" tag. Others show "Pick a different issue"
//     so the user can still select them and confirm an issue manually.
//
//   Stage 2 — ISSUE CONFIRM
//     User picked a series. If it has matching_issue, show it pre-selected
//     with cover + title. User can change the issue # via input. On
//     confirm, POST the link.
//
// The "issue # too constraining" complaint from V1 is fixed by letting
// the search find the right *series* first and only then asking about
// the issue — so a Sandman/Locke & Key crossover series that doesn't
// happen to have a #0 still shows up.

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/apiClient";

export default function CatalogLinkPicker({
  entry, // {collection_id, comic: {series_title, issue_number, release_year}, candidates? }
  userId,
  onApply, // async (gcd_issue_id) => void
  onClose,
}) {
  const originalIssue = String(entry?.comic?.issue_number ?? "");

  // Seed the search box with the user's title cleaned of common noise.
  const initialQuery = String(entry?.comic?.series_title ?? "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+Vol\.?\s*\d+\s*$/i, "")
    .replace(/\s+The\s+New\s*52\s*$/i, "")
    .replace(/^The\s+/i, "")
    .trim();

  // Stage 1 (series-list) state.
  const [query, setQuery] = useState(initialQuery);
  const [seriesResults, setSeriesResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(null);
  const lastQueryRef = useRef("");

  // Stage 2 (issue-confirm) state.
  const [pickedSeries, setPickedSeries] = useState(null); // series obj
  const [issueQuery, setIssueQuery] = useState(originalIssue);
  const [issueResults, setIssueResults] = useState([]);
  const [issueSearching, setIssueSearching] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-run the initial title search on open.
  useEffect(() => {
    runSeriesSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSeriesSearch(q) {
    if (!q || q.length < 2) {
      setSeriesResults([]);
      setHasSearched(false);
      return;
    }
    setSearching(true);
    lastQueryRef.current = q;
    try {
      const url = new URL("/api/library/catalog-link/search", window.location.origin);
      url.searchParams.set("mode", "series");
      url.searchParams.set("q", q);
      if (originalIssue) url.searchParams.set("issue", originalIssue);
      const res = await authedFetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        setSeriesResults([]);
        return;
      }
      const data = await res.json();
      if (lastQueryRef.current !== q) return;
      setSeriesResults(data.results ?? []);
      setHasSearched(true);
    } finally {
      setSearching(false);
    }
  }

  // Debounce search-on-type.
  useEffect(() => {
    if (pickedSeries) return; // pause stage-1 search while in stage 2
    const t = setTimeout(() => runSeriesSearch(query), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runIssueLookup(series_gcd_id, issue) {
    if (!series_gcd_id || !issue) {
      setIssueResults([]);
      return;
    }
    setIssueSearching(true);
    try {
      const url = new URL("/api/library/catalog-link/search", window.location.origin);
      url.searchParams.set("mode", "issue");
      url.searchParams.set("series_gcd_id", String(series_gcd_id));
      url.searchParams.set("issue", String(issue));
      const res = await authedFetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        setIssueResults([]);
        return;
      }
      const data = await res.json();
      setIssueResults(data.results ?? []);
    } finally {
      setIssueSearching(false);
    }
  }

  function handlePickSeries(series) {
    setPickedSeries(series);
    setIssueQuery(originalIssue);
    // Pre-populate issue results: if matching_issue exists, use it; else
    // start with empty and let the issue-input drive a lookup.
    if (series.matching_issue) {
      setIssueResults([
        {
          gcd_issue_id: series.matching_issue.gcd_issue_id,
          issue_number: series.matching_issue.issue_number,
          issue_title: series.matching_issue.issue_title,
          issue_year: series.matching_issue.issue_year,
          cover_url: series.sample_cover_url,
        },
      ]);
    } else {
      // No match for original issue — run the lookup so user sees "no issue
      // #X under this series" immediately.
      runIssueLookup(series.series_gcd_id, originalIssue);
    }
  }

  // Issue input → debounced lookup against the picked series.
  useEffect(() => {
    if (!pickedSeries) return;
    const t = setTimeout(
      () => runIssueLookup(pickedSeries.series_gcd_id, issueQuery),
      250
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueQuery, pickedSeries]);

  async function handleConfirmIssue(gcd_issue_id) {
    setApplying(true);
    try {
      await onApply(gcd_issue_id);
    } finally {
      setApplying(false);
    }
  }

  function yearSpan(s) {
    if (s.series_year_start && s.series_year_end && s.series_year_start !== s.series_year_end) {
      return `${s.series_year_start}–${s.series_year_end}`;
    }
    if (s.series_year_start) return String(s.series_year_start);
    return "Year unknown";
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0d1733",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          width: "min(720px, 100%)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6, fontWeight: 700 }}>
              {pickedSeries ? "Step 2 — confirm issue" : "Step 1 — find the series"}
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 700, marginTop: 2 }}>
              {entry?.comic?.series_title} #{entry?.comic?.issue_number}
              {entry?.comic?.release_year ? ` (${entry.comic.release_year})` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              color: "#fff",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "0.85rem",
              flexShrink: 0,
            }}
          >
            Cancel
          </button>
        </div>

        {/* ════════ STAGE 1 ═══════════════════════════════════════════════ */}
        {!pickedSeries && (
          <>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by series title…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#fff",
                  fontSize: "0.95rem",
                  colorScheme: "dark",
                }}
              />
              <div style={{ fontSize: "0.75rem", opacity: 0.55, marginTop: 6 }}>
                Pick the series that matches yours. You&rsquo;ll confirm the issue number in the next step.
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {searching && (
                <div style={{ padding: "20px", textAlign: "center", opacity: 0.6 }}>
                  Searching…
                </div>
              )}
              {!searching && seriesResults.length === 0 && hasSearched && (
                <div style={{ padding: "24px", textAlign: "center", opacity: 0.55, fontSize: "0.9rem" }}>
                  No catalog series match &ldquo;{query}&rdquo;. Try a shorter title or alternate spelling.
                </div>
              )}
              {!searching &&
                seriesResults.map((s) => {
                  const hasMatch = !!s.matching_issue;
                  return (
                    <button
                      key={s.series_gcd_id}
                      type="button"
                      onClick={() => handlePickSeries(s)}
                      disabled={applying}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        padding: "10px 12px",
                        marginBottom: 6,
                        borderRadius: 10,
                        border: hasMatch
                          ? "1px solid rgba(76,175,80,0.35)"
                          : "1px solid rgba(255,255,255,0.08)",
                        background: hasMatch
                          ? "rgba(76,175,80,0.06)"
                          : "rgba(255,255,255,0.03)",
                        color: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = hasMatch
                          ? "rgba(76,175,80,0.12)"
                          : "rgba(255,215,0,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = hasMatch
                          ? "rgba(76,175,80,0.06)"
                          : "rgba(255,255,255,0.03)";
                      }}
                    >
                      <div
                        style={{
                          width: 52,
                          height: 78,
                          flexShrink: 0,
                          borderRadius: 4,
                          overflow: "hidden",
                          background: "rgba(0,0,0,0.4)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {s.sample_cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.sample_cover_url}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {s.series_title}
                        </div>
                        <div style={{ fontSize: "0.8rem", opacity: 0.8, marginTop: 2 }}>
                          <strong style={{ color: s.publisher ? "#ddd" : "rgba(255,255,255,0.5)" }}>
                            {s.publisher || "Unknown Publisher"}
                          </strong>
                          {" · "}
                          {yearSpan(s)}
                          {s.issue_count ? ` · ${s.issue_count} issue${s.issue_count === 1 ? "" : "s"}` : ""}
                        </div>
                        <div style={{ fontSize: "0.7rem", opacity: 0.45, marginTop: 2 }}>
                          gcd-{s.series_gcd_id}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        {hasMatch ? (
                          <>
                            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#4CAF50" }}>
                              ✓ Has #{s.matching_issue.issue_number}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--cc-gold, #FFD700)", marginTop: 4 }}>
                              Select →
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: "0.7rem", opacity: 0.55 }}>
                              No #{originalIssue}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--cc-gold, #FFD700)", marginTop: 4 }}>
                              Browse →
                            </div>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </>
        )}

        {/* ════════ STAGE 2 ═══════════════════════════════════════════════ */}
        {pickedSeries && (
          <>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setPickedSeries(null);
                    setIssueResults([]);
                  }}
                  disabled={applying}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 6,
                    color: "#fff",
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                  }}
                >
                  ← Back
                </button>
                <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                  {pickedSeries.series_title}
                </div>
              </div>
              <div style={{ fontSize: "0.8rem", opacity: 0.75, marginBottom: 10 }}>
                {pickedSeries.publisher || "Unknown Publisher"} · {yearSpan(pickedSeries)}
                {pickedSeries.issue_count ? ` · ${pickedSeries.issue_count} issues` : ""}
              </div>
              <label style={{ display: "block", fontSize: "0.75rem", opacity: 0.7, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>
                Issue #
              </label>
              <input
                type="text"
                value={issueQuery}
                onChange={(e) => setIssueQuery(e.target.value)}
                placeholder="e.g. 1, 1A, 0, Annual 1"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#fff",
                  fontSize: "0.95rem",
                  colorScheme: "dark",
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {issueSearching && (
                <div style={{ padding: "20px", textAlign: "center", opacity: 0.6 }}>
                  Looking up issue…
                </div>
              )}
              {!issueSearching && issueResults.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center", opacity: 0.55, fontSize: "0.9rem" }}>
                  No issue #{issueQuery || "—"} under this series. Try a different number, or hit Back and pick a different series.
                </div>
              )}
              {!issueSearching &&
                issueResults.map((i) => (
                  <button
                    key={i.gcd_issue_id}
                    type="button"
                    onClick={() => handleConfirmIssue(i.gcd_issue_id)}
                    disabled={applying}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "10px 12px",
                      marginBottom: 6,
                      borderRadius: 10,
                      border: "1px solid rgba(255,215,0,0.35)",
                      background: "rgba(255,215,0,0.06)",
                      color: "#fff",
                      cursor: applying ? "not-allowed" : "pointer",
                      opacity: applying ? 0.5 : 1,
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 78,
                        flexShrink: 0,
                        borderRadius: 4,
                        overflow: "hidden",
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {i.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={i.cover_url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : null}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        #{i.issue_number}
                        {i.issue_title ? ` — ${i.issue_title}` : ""}
                      </div>
                      <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: 2 }}>
                        {i.issue_year ?? "Year unknown"}
                      </div>
                      <div style={{ fontSize: "0.7rem", opacity: 0.45, marginTop: 2 }}>
                        gcd-{i.gcd_issue_id}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: "0.8rem", fontWeight: 700, color: "var(--cc-gold, #FFD700)" }}>
                      {applying ? "Linking…" : "Confirm →"}
                    </div>
                  </button>
                ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: "0.75rem",
            opacity: 0.55,
          }}
        >
          Linking replaces this row&rsquo;s local entry with the catalog issue. Your photo (if uploaded) is preserved.
        </div>
      </div>
    </div>
  );
}
