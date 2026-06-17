"use client";

// /arc/[id] — story arc completion page.
//
// Shows an arc's full issue list (cross-series, in arc order), the user's
// completion progress against it, and direct links to each issue's detail
// page. This is the "you own 11 of 14 issues from X-Cutioner's Song, here's
// what's missing" surface.
//
// Client component: server-side `supabase.auth.getUser()` via plain
// @supabase/supabase-js doesn't read Next.js session cookies, which caused
// the page to always render as anonymous even for signed-in users. We mirror
// the issue-page pattern: read the viewer from AuthContext and pass user_id
// as a query param to the API.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";

export default function StoryArcPage() {
  const { id } = useParams();
  const { user, isPro } = useAuth();
  const { addToCollection } = useLibrary();
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadArc() {
      setLoading(true);
      setNotFoundFlag(false);
      try {
        const userParam = user?.id ? `?user_id=${encodeURIComponent(user.id)}` : "";
        const res = await fetch(`/api/story-arc/${id}${userParam}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setNotFoundFlag(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setPayload(data);
      } catch (err) {
        console.error("Arc page load failed:", err);
        if (!cancelled) setNotFoundFlag(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadArc();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  if (loading) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem", opacity: 0.7 }}>
        Loading arc…
      </main>
    );
  }

  if (notFoundFlag || !payload?.arc) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Story arc not found</h1>
        <p style={{ opacity: 0.7 }}>
          <Link href="/" style={{ color: "var(--cc-gold, #FFD700)" }}>← Back home</Link>
        </p>
      </main>
    );
  }

  const { arc, issues, ownership } = payload;
  const isSignedIn = Boolean(user?.id);
  const pct =
    ownership.matchable > 0
      ? Math.round((ownership.owned / ownership.matchable) * 100)
      : 0;

  // CV returns description as HTML (<p>, <h4>, <ul>, etc). Preserve block
  // structure: convert block-level closers to paragraph breaks, headings to
  // their own block, then strip remaining tags. Split on the marker to render
  // a real paragraph per chunk instead of one wall of prose.
  const descBlocks = (arc.description || "")
    .replace(/<\/(p|h[1-6]|li|div|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const distinctSeries = [
    ...new Set(issues.map((i) => i.series_title).filter(Boolean)),
  ];

  // Pro arc-completion intelligence: issues in the arc that are catalogued
  // (have a gcd_issue_id we can add to a library row) but the viewer doesn't
  // already own or have wishlisted. Powers the "add all missing to wantlist"
  // Pro action.
  const missingIssues = issues.filter(
    (i) => i.gcd_issue_id != null && !i.owned && !i.wishlisted
  );
  const wishlistedCount = issues.filter((i) => i.wishlisted && !i.owned).length;

  async function handleAddAllMissingToWantlist() {
    if (!user?.id || !isPro || missingIssues.length === 0) return;
    setBulkAdding(true);
    setBulkResult(null);
    let added = 0;
    let failed = 0;
    for (const issue of missingIssues) {
      try {
        await addToCollection(`gcd-${issue.gcd_issue_id}`, "wishlist");
        added += 1;
      } catch (err) {
        console.error("Bulk add failed for", issue.gcd_issue_id, err);
        failed += 1;
      }
    }
    setBulkAdding(false);
    setBulkResult({ added, failed });
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: arc.image_url ? "200px 1fr" : "1fr",
          gap: "1.5rem",
          alignItems: "start",
          marginBottom: "1.5rem",
        }}
      >
        {arc.image_url && (
          <div
            style={{
              borderRadius: 10,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={arc.image_url} alt={arc.name} style={{ width: "100%", display: "block" }} />
          </div>
        )}
        <div>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.6,
              marginBottom: 4,
            }}
          >
            Story Arc
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: "2rem", lineHeight: 1.15 }}>
            {arc.name}
          </h1>
          {arc.deck && (
            <p style={{ opacity: 0.85, margin: "0 0 12px", fontSize: "1.05rem" }}>
              {arc.deck}
            </p>
          )}
          <div style={{ fontSize: "0.9rem", opacity: 0.7, marginBottom: 12 }}>
            {arc.publisher && <span>{arc.publisher}</span>}
            {distinctSeries.length > 0 && (
              <span>
                {arc.publisher && " · "}
                Spans {distinctSeries.length} series · {ownership.total} issues
              </span>
            )}
          </div>

          {/* ── Completion progress ─────────────────────────────────── */}
          {isSignedIn && ownership.matchable > 0 ? (
            <div
              style={{
                marginTop: 4,
                padding: "12px 14px",
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
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  You own {ownership.owned} of {ownership.matchable}
                  {ownership.matchable !== ownership.total &&
                    ` (of ${ownership.total} total in arc)`}
                  {wishlistedCount > 0 && (
                    <span style={{ opacity: 0.7, fontWeight: 500 }}>
                      {" "}· {wishlistedCount} on wantlist
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 700, color: "var(--cc-gold, #FFD700)" }}>
                  {pct}%
                </div>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background:
                      pct === 100
                        ? "linear-gradient(90deg, #FFD700, #FFC400)"
                        : "linear-gradient(90deg, #4CAF50, #2196F3)",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          ) : !isSignedIn ? (
            <div
              style={{
                marginTop: 4,
                padding: "12px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: "0.9rem",
              }}
            >
              <Link href="/login" style={{ fontWeight: 700, color: "var(--cc-gold, #FFD700)" }}>
                Sign in
              </Link>{" "}
              to see which issues you own.
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Missing-issues Pro panel ───────────────────────────────────── */}
      {isSignedIn && missingIssues.length > 0 && (
        <section
          style={{
            marginBottom: "1.5rem",
            padding: "14px 16px",
            borderRadius: 10,
            background: isPro
              ? "rgba(76,175,80,0.06)"
              : "rgba(255,255,255,0.04)",
            border: isPro
              ? "1px solid rgba(76,175,80,0.25)"
              : "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "0.95rem" }}>
            <strong>{missingIssues.length} issue{missingIssues.length === 1 ? "" : "s"} not yet tracked</strong>
            {" "}from this arc{wishlistedCount > 0 ? ` (${wishlistedCount} already on your wantlist)` : ""}.
            {!isPro && (
              <span style={{ opacity: 0.7 }}>
                {" "}Skip {missingIssues.length} clicks &mdash; Pro adds the whole missing run to your wantlist in one tap.
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
                ? `Adding… (${missingIssues.length})`
                : `+ Add all ${missingIssues.length} to wantlist`}
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
              Upgrade to Pro →
            </Link>
          )}
          {bulkResult && (
            <div
              style={{
                flexBasis: "100%",
                fontSize: "0.85rem",
                opacity: 0.85,
                marginTop: 4,
              }}
            >
              ✓ Added {bulkResult.added} to your wantlist
              {bulkResult.failed > 0 && ` (${bulkResult.failed} failed — try again)`}
              .
            </div>
          )}
        </section>
      )}

      {/* ── Issue grid ──────────────────────────────────────────────────── */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {issues.map((i) => {
          const inner = (
            <>
              <div
                style={{
                  aspectRatio: "2/3",
                  borderRadius: 8,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  position: "relative",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={i.cover || "/fallback-cover.png"}
                  alt={`${i.series_title ?? "Unknown"} #${i.issue_number ?? "?"}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {i.owned && (
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      padding: "3px 8px",
                      borderRadius: 999,
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      background: "linear-gradient(90deg, #4CAF50, #2196F3)",
                      color: "#fff",
                      letterSpacing: "0.04em",
                    }}
                  >
                    OWNED
                  </span>
                )}
                {i.wishlisted && !i.owned && (
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      padding: "3px 8px",
                      borderRadius: 999,
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      background: "rgba(255,255,255,0.18)",
                      color: "#fff",
                      letterSpacing: "0.04em",
                    }}
                  >
                    WANTLIST
                  </span>
                )}
                {!i.gcd_issue_id && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 8,
                      right: 8,
                      padding: "2px 6px",
                      borderRadius: 6,
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      background: "rgba(0,0,0,0.55)",
                      color: "rgba(255,255,255,0.7)",
                    }}
                    title="This issue is not yet in our catalog"
                  >
                    UNCATALOGED
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: "0.85rem", lineHeight: 1.3 }}>
                <div style={{ fontWeight: 700 }}>
                  {i.series_title ?? "Unknown series"} #{i.issue_number ?? "?"}
                </div>
                {i.cv_issue_name && (
                  <div style={{ opacity: 0.65, marginTop: 2 }}>{i.cv_issue_name}</div>
                )}
              </div>
            </>
          );

          return i.href ? (
            <Link
              key={i.cv_issue_id}
              href={i.href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              {inner}
            </Link>
          ) : (
            <div key={i.cv_issue_id} style={{ opacity: 0.65 }}>
              {inner}
            </div>
          );
        })}
      </section>

      {/* ── Description ─────────────────────────────────────────────────── */}
      {descBlocks.length > 0 && (
        <section
          style={{
            padding: "1rem 1.2rem",
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            opacity: 0.9,
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>About this arc</h2>
          {descBlocks.map((para, idx) => (
            <p key={idx} style={{ margin: idx === 0 ? "0 0 12px" : "0 0 12px" }}>
              {para}
            </p>
          ))}
        </section>
      )}
    </main>
  );
}
