"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { trackEvent } from "@/lib/analytics";
import AdSlot from "@/components/AdSlot";
import { SLOT } from "@/lib/houseAds";
import { coverThumb } from "@/lib/coverThumb";
import { buildSeriesIntro } from "@/lib/seriesSeo";
import KeyTimeline from "@/components/KeyTimeline";
import { KeyRound } from "lucide-react";
import { publisherHref } from "@/lib/publisherPages";
import { isUnnumberedIssue, issueNumberSuffix } from "@/lib/issueNumberLabel";
import { ageSpanLabel, heroKeyCovers } from "@/lib/seriesPage";
import {
  buildRunQuickAddPayload,
  RUN_QUICK_ADD_LIMIT,
  selectableIssueIds,
  selectIssueRange,
} from "@/lib/runQuickAdd";

// The publisher as a link to its page when it has one.
function publisherLink(name) {
  const href = publisherHref(name);
  return href ? <Link href={href}>{name}</Link> : <span>{name}</span>;
}

const ISSUE_BATCH = 60;

function CreatorLinks({ creators }) {
  return (creators ?? []).map((creator, index, list) => (
    <span key={creator.slug}>
      {index ? (index === list.length - 1 ? " and " : ", ") : ""}
      <Link href={`/creator/${creator.slug}`}>{creator.name}</Link>
    </span>
  ));
}

function issueSortValue(issueNumber) {
  // Comics often store dual-numbered issues like "30 (471)" (Vol 2 / Vol 1
  // legacy numbering - Spider-Man, Fantastic Four, X-Men all do this), or
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

// initialSeries is the /api/series/[id] payload rendered on the server
// (src/app/series/[id]/page.js), so the issue grid is in the first HTML.
// null means the server did not have it and the client fetches as before.
export default function SeriesClient({ initialSeries = null, initialOwnMode = false }) {
  const { id } = useParams();
  const [series, setSeries] = useState(initialSeries);
  const [loading, setLoading] = useState(!initialSeries);
  const skipFetchFor = useRef(initialSeries ? id : null);
  const [sortMode, setSortMode] = useState("issue-asc");
  // Big runs (The Amazing Spider-Man is ~900 issues) rendered every card at
  // once: ~4,000 DOM nodes and 1.5 s of blocked main thread on a phone.
  // Render the first batch, then add more as the reader scrolls near the end.
  const [shown, setShown] = useState(ISSUE_BATCH);
  const moreRef = useRef(null);

  const { user, loading: authLoading } = useAuth();
  const {
    collectionIds,
    wishlistIds,
    addToCollection,
    addRunToCollection,
    removeFromCollection,
  } = useLibrary();
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [ownMode, setOwnMode] = useState(initialOwnMode);
  const [selectedIssueIds, setSelectedIssueIds] = useState(new Set());
  const [rangeStartId, setRangeStartId] = useState(null);
  const [selectingRange, setSelectingRange] = useState(false);
  const [runAdding, setRunAdding] = useState(false);
  const markingMode = Boolean(user && ownMode);

  async function updateIssueLibrary(issueId, status) {
    try {
      const result = status
        ? await addToCollection(issueId, status)
        : await removeFromCollection(issueId, {
            scope: collectionIds?.has(String(issueId)) ? "latest-copy" : "wishlist",
          });
      setMutationError(
        result?.ok === false ? result.error || "Library update failed" : null
      );
    } catch (err) {
      console.error("Series issue library update failed:", err);
      setMutationError("Library update failed");
    }
  }

  useEffect(() => {
    if (!id) return;
    if (skipFetchFor.current !== null && skipFetchFor.current === id) {
      skipFetchFor.current = null;
      return;
    }
    skipFetchFor.current = null;

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

  // Funnel: one view event per loaded series, after auth has settled so
  // logged_in is real rather than "not resolved yet".
  useEffect(() => {
    if (!series?.id || authLoading) return;
    trackEvent("series_view", {
      series_id: series.id,
      series_title: series.title,
      publisher: series.publisher,
      logged_in: Boolean(user),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series?.id, authLoading]);

  // Load the next batch when the "show all" row scrolls into view.
  useEffect(() => {
    const el = moreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + ISSUE_BATCH * 2);
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, series?.issues?.length]);

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

  function toggleIssueSelection(issueId) {
    const key = String(issueId);
    if (collectionIds?.has(key)) return;

    if (selectingRange) {
      if (!rangeStartId) {
        setRangeStartId(key);
        setSelectedIssueIds(new Set([key]));
        return;
      }
      const range = selectIssueRange(sortedIssues, rangeStartId, key, collectionIds)
        .slice(0, RUN_QUICK_ADD_LIMIT);
      setSelectedIssueIds(new Set(range));
      setRangeStartId(null);
      setSelectingRange(false);
      return;
    }

    setSelectedIssueIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (next.size < RUN_QUICK_ADD_LIMIT) next.add(key);
      return next;
    });
  }

  async function handleRunAdd() {
    const payload = buildRunQuickAddPayload(selectedIssueIds, collectionIds);
    if (!payload.issue_ids.length) return;

    setRunAdding(true);
    setMutationError(null);
    const ids = payload.issue_ids.map((issueId) => `gcd-${issueId}`);
    const result = await addRunToCollection(ids);
    setRunAdding(false);
    if (!result.ok) {
      setMutationError(result.error || "Could not add those issues.");
      return;
    }

    setSelectedIssueIds(new Set());
    trackEvent("run_quick_add", {
      count: result.added?.length ?? ids.length,
      series_id: series.id,
    });
  }

  // Run completion math. issue.id is already the library key
  // ("gcd-<gcd_id>" for GCD issues, plain uuid for local user comics) - same
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
    if (!user?.id || runStats.missing.length === 0) return;
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
        const result = await addToCollection(String(issue.id), "wishlist");
        if (result?.ok === false) failed += 1;
        else added += 1;
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
  const ageLabel = ageSpanLabel(series.year_start, series.year_end);
  const backCovers = heroKeyCovers(series.key_issues, series.featured_cover);
  const majorKeyCount = (series.key_issues ?? []).filter((issue) => Number(issue.tier) === 1).length;
  // Key issues by grid id ("gcd-<id>"), so the run grid can flag them.
  const keyByIssueId = new Map((series.key_issues ?? []).map((k) => [`gcd-${k.gcd_issue_id}`, k]));
  const yearCount = series.year_start && series.year_end
    ? Math.max(1, Number(series.year_end) - Number(series.year_start) + 1)
    : null;
  const formatText = series.format_tag || series.format_label || (series.format_noun === "one-shot" ? "One-shot" : "Ongoing series");

  return (
    <main className="page-wrapper">
      <section className="comic-panel series-public-page">
        <nav className="series-breadcrumb" aria-label="Breadcrumb">
          {publisherLink(series.publisher)}<span aria-hidden="true">/</span><span>{series.title}</span><span aria-hidden="true">/</span><span>{series.year_start || "Unknown year"} series</span>
        </nav>

        <div className="series-public-hero">
          <div className={`series-cover-stack cover-count-${backCovers.length + 1}`}>
            {backCovers.map((cover, index) => (
              <img key={cover} src={coverThumb(cover)} alt="" className={`series-cover-back series-cover-back-${index + 1}`} width={220} height={330} loading="lazy" />
            ))}
            <img src={coverThumb(series.featured_cover || "/fallback-cover.png")} alt={series.title} className="series-cover-front" width={220} height={330} fetchPriority="high" loading="eager" />
          </div>
          <div className="series-hero-copy">
            <div className="series-eyebrow">{publisherLink(series.publisher)} <span>·</span> {formatText} <span>·</span> {yearLabel}</div>
            <h1 className="series-public-title">{series.title} {series.year_start && <small>({series.year_start})</small>}</h1>
            <div className="series-chip-row">
              {ageLabel && <span className="series-chip">{ageLabel}</span>}
              {(series.links ?? []).map((line) => <span className="series-chip" key={`${line.label}:${line.href}`}>{line.label} <Link href={line.href}>{line.title}{line.year ? ` (${line.year})` : ""}</Link></span>)}
              {Number(series.reprint_count) > 0 && <span className="series-chip">{Number(series.reprint_count).toLocaleString("en-US")} reprints worldwide</span>}
            </div>
            <div className="series-hero-blurb">
              <p>{buildSeriesIntro({ ...series, top_creators: null, creator_credited_issues: null })}</p>
              {(series.top_creators?.writers?.length > 0 || series.top_creators?.artists?.length > 0) && <p>
                {series.top_creators?.writers?.length > 0 && <>Written most by <CreatorLinks creators={series.top_creators.writers.slice(0, 2)} /></>}
                {series.top_creators?.writers?.length > 0 && series.top_creators?.artists?.length > 0 ? ", " : ""}
                {series.top_creators?.artists?.length > 0 && <>drawn most by <CreatorLinks creators={series.top_creators.artists.slice(0, 2)} /></>}.
              </p>}
            </div>
            <div className="series-stats-strip">
              <div><strong>{series.issue_count}</strong><span>issues</span></div>
              {series.key_issues?.length > 0 && <div><strong>{series.key_issues.length}</strong><span>key issues, {majorKeyCount} major</span></div>}
              <div><strong>{yearCount ?? "?"}</strong><span>{yearCount === 1 ? "year" : "years"}, {series.year_start && series.year_end ? `${series.year_start} to ${series.year_end}` : yearLabel}</span></div>
              {Number(series.member_stats?.owners) >= 3 ? <div><strong>{series.member_stats.owners}</strong><span>members own {series.member_stats.copies} copies</span></div> : Number(series.reprint_count) > 0 ? <div><strong>{Number(series.reprint_count).toLocaleString("en-US")}</strong><span>reprints worldwide</span></div> : null}
            </div>
            <div className="series-hero-actions"><Link href="#issues" className="series-primary-action">Add issues I own</Link></div>
          </div>
        </div>

        <div className="series-legacy-hero" aria-hidden="true">

        <div
          style={{
            display: "grid",
            // Same auto-fit pattern as the issue page hero - collapses to
            // a single column under ~520px so phones don't horizontal-scroll.
            gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
            gap: "24px",
            alignItems: "start",
            marginBottom: "28px",
          }}
        >
          <div className="issue-cover-frame" style={{ maxWidth: 220, aspectRatio: "2 / 3" }}>
            {/* The page's largest paint: load it first, at a known size so
                nothing shifts when it arrives. */}
            <img
              src={coverThumb(series.featured_cover || "/fallback-cover.png")}
              alt={series.title}
              className="issue-cover-img"
              width={220}
              height={330}
              fetchPriority="high"
              loading="eager"
              style={{ height: "100%", objectFit: "cover" }}
            />
          </div>

          <div>
            <h1 className="hero-title" style={{ marginBottom: "10px" }}>
              {series.title}
            </h1>

            <p style={{ maxWidth: "760px", marginBottom: "12px" }}>
              {buildSeriesIntro(series)}
            </p>

            {series.links?.length > 0 && (
              <div style={{ maxWidth: "760px", marginBottom: "12px" }}>
                {series.links.map((line) => (
                  <div key={`${line.label}:${line.href}`} style={{ marginBottom: line.note ? "6px" : "2px" }}>
                    <div>
                      {line.label}{" "}
                      <strong><Link href={line.href}>{line.title}</Link></strong>
                      {line.year ? ` (${line.year})` : ""}
                    </div>
                    {line.note && (
                      <div className="muted" style={{ fontSize: "0.875rem" }}>{line.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(series.top_creators?.writers?.length > 0 || series.top_creators?.artists?.length > 0) && (
              <p style={{ maxWidth: "760px", marginBottom: "12px" }}>
                {series.top_creators.writers?.length > 0 && (
                  <>Written by {series.top_creators.writers.map((creator, index, list) => (
                    <span key={creator.slug}>{index ? (index === list.length - 1 ? " and " : ", ") : ""}<Link href={`/creator/${creator.slug}`}>{creator.name}</Link></span>
                  ))}.</>
                )}{series.top_creators.artists?.length > 0 && (
                  <>{series.top_creators.writers?.length > 0 ? " " : ""}Art by {series.top_creators.artists.map((creator, index, list) => (
                    <span key={creator.slug}>{index ? (index === list.length - 1 ? " and " : ", ") : ""}<Link href={`/creator/${creator.slug}`}>{creator.name}</Link></span>
                  ))}.</>
                )}
              </p>
            )}

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
              {series.format_tag ? (
                <span className="pill pill-format" title={series.format_label || series.format_tag_title || undefined}>{series.format_tag}</span>
              ) : (
                null
              )}
            </div>

            {series.collects?.length > 0 ? (
              // Collected edition: say what each volume collects (from GCD's
              // series notes) instead of the generic run blurb. Covers for
              // these come from their own ComicVine volume or not at all;
              // they never borrow the monthly's art.
              <div className="series-collects muted" style={{ maxWidth: "760px" }}>
                <p style={{ marginBottom: "6px" }}>
                  This is a collected edition. Each volume collects issues of the
                  ongoing series:
                </p>
                <ul className="series-collects-list">
                  {series.collects.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="muted" style={{ maxWidth: "760px" }}>
                Browse the run and jump into any issue.
              </p>
            )}
          </div>
        </div>

        </div>

        {/* Full width under the hero: the timeline needs room, the hero's
            text column is too narrow for 70 years of keys. */}
        {series.key_issues?.length > 0 && (
          <>
            <KeyTimeline issues={series.key_issues} />
            <Link className="series-shareable-link series-all-keys-link" href={`/series/${id}/keys`}>
              See all {series.key_issues.length} keys
            </Link>
          </>
        )}

        <div className="series-public-details">
          <section className="series-public-panel">
            <h2>Who made it</h2>
            <div className="series-creator-columns">
              {[{ label: "Writers", rows: series.top_creators?.writers }, { label: "Artists", rows: series.top_creators?.artists }].map(({ label, rows }) => (
                <div key={label}>
                  <h3>{label}</h3>
                  <ol>{(rows ?? []).slice(0, 3).map((creator) => <li key={creator.slug}><Link href={`/creator/${creator.slug}`}>{creator.name}</Link><span>{creator.issues} issue{creator.issues === 1 ? "" : "s"}</span></li>)}</ol>
                </div>
              ))}
            </div>
          </section>
          {(series.sibling_volumes?.length ?? 0) > 1 && <section className="series-public-panel">
            <h2>Every {series.title} run</h2>
            <div className="series-volume-list">
              {(series.sibling_volumes ?? []).map((volume) => (
                <Link href={`/series/${volume.id}`} key={volume.id} className="series-volume-item">
                  <span><strong>{volume.title} ({volume.year_start_cached || "year unknown"})</strong><small>{volume.issue_count_cached} issues · {volume.year_start_cached || "?"}–{volume.year_end_cached || volume.year_start_cached || "?"}</small></span>
                  <span>{volume.id === series.id ? <em>You&apos;re here</em> : Number(volume.reprint_count) > 0 ? `${Number(volume.reprint_count).toLocaleString("en-US")} reprints` : ""}</span>
                </Link>
              ))}
            </div>
            {Number(series.sibling_volume_count) > (series.sibling_volumes?.length ?? 0) && (
              <Link className="series-all-runs" href={`/search?q=${encodeURIComponent(series.title)}`}>All {series.sibling_volume_count} {series.title} series</Link>
            )}
          </section>}
        </div>

        {/* ── Run completion ────────────────────────────────────────────
            Only render when the viewer is signed in and there's at least one
            owned/wishlisted issue from this run - otherwise it's noise on
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
                </div>
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
              </div>
            )}
            {bulkResult && (
              <div style={{ marginTop: 8, fontSize: "0.85rem", opacity: 0.85 }}>
                Added {bulkResult.added} to your wantlist
                {bulkResult.failed > 0 && `, ${bulkResult.failed} failed`}.
              </div>
            )}
          </div>
        )}

        {sortedIssues.length > 0 && (
          <div className="run-quick-add-toolbar">
            {user ? (
              <>
                <button
                  type="button"
                  className={`run-quick-add-toggle${ownMode ? " is-active" : ""}`}
                  onClick={() => {
                    setOwnMode((current) => !current);
                    setSelectingRange(false);
                    setRangeStartId(null);
                  }}
                >
                  {ownMode ? "Done marking" : "Mark what you own"}
                </button>
                {ownMode && (
                  <div className="run-quick-add-tools">
                    <button
                      type="button"
                      className={selectingRange ? "is-active" : ""}
                      onClick={() => {
                        setSelectingRange((current) => !current);
                        setRangeStartId(null);
                      }}
                    >
                      {selectingRange
                        ? rangeStartId
                          ? "Tap the last issue"
                          : "Tap the first issue"
                        : "Select a range"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIssueIds(new Set(
                        selectableIssueIds(sortedIssues, collectionIds)
                          .slice(0, RUN_QUICK_ADD_LIMIT)
                      ))}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIssueIds(new Set());
                        setRangeStartId(null);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link
                href={`/signup?next=${encodeURIComponent(`/series/${id}?own=1`)}`}
                className="run-quick-add-signup"
              >
                Sign up to mark what you own
              </Link>
            )}
          </div>
        )}

        <div
          id="issues"
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
            {sortedIssues.length > 0 && (
              <Link className="series-shareable-link" href={`/series/${id}/checklist`}>
                Printable checklist
              </Link>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="sortMode" className="muted">
              Sort
            </label>
            <select
              id="sortMode"
              value={sortMode}
              onChange={(e) => {
                setSortMode(e.target.value);
                setShown(ISSUE_BATCH);
              }}
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
            {/* House-ad row. CSS pins it to grid row 2, so it lands after
                the first full row of issues at any column count; DOM
                position is irrelevant. */}
            <AdSlot position={SLOT.SERIES_INLINE_1} pageKey={String(id)} className="ad-slot--row2" />
            {sortedIssues.slice(0, shown).map((issue) => {
              const key = String(issue?.id ?? "");
              const isOwned = collectionIds?.has(key);
              const isWanted = !isOwned && wishlistIds?.has(key);
              const isSelected = selectedIssueIds.has(key);
              const keyIssue = keyByIssueId.get(key);
              const majorKey = Number(keyIssue?.tier) === 1;
              return (
              <article
                key={issue.id}
                className={`comic-card${keyIssue ? ` comic-card--key${majorKey ? " comic-card--major-key" : ""}` : ""}${markingMode ? " run-select-card" : ""}${isSelected ? " is-selected" : ""}${isOwned && markingMode ? " is-owned" : ""}`}
              >
                <Link
                  prefetch={false}
                  href={`/issue/${issue.id}`}
                  className="card-link"
                  aria-label={markingMode ? `${isSelected ? "Deselect" : "Select"} issue ${issue.issue_number}` : undefined}
                  onClick={(event) => {
                    if (!markingMode) return;
                    event.preventDefault();
                    toggleIssueSelection(key);
                  }}
                >
                  <div className="comic-card-cover" style={{ position: "relative" }}>
                    <img
                      src={coverThumb(issue.cover || "/fallback-cover.png")}
                      alt={`${series.title}${issueNumberSuffix(issue.issue_number)}${issue.release_year ? ` (${issue.release_year})` : ""} cover`}
                      loading="lazy"
                    />
                    {isOwned && (
                      <span
                        style={{
                          position: "absolute",
                          // .comic-card-cover img sets z-index:1 explicitly
                          // (globals.css) - without a competing z-index here,
                          // that explicit layer paints over this badge
                          // regardless of DOM order, hiding it completely
                          // behind the cover. Found live 2026-08-29.
                          zIndex: 2,
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
                    {isSelected && (
                      <span className="run-selected-check" aria-hidden="true">✓</span>
                    )}
                    {isWanted && (
                      <span
                        style={{
                          position: "absolute",
                          zIndex: 2,
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
                    {keyIssue && (
                      <span
                        className="series-key-badge"
                        title={`${majorKey ? "Major key" : "Key"}: ${keyIssue.reason}`}
                      >
                        <KeyRound size={13} strokeWidth={2.6} aria-hidden="true" />
                        {majorKey ? "KEY" : null}
                      </span>
                    )}
                  </div>

                  <div className="comic-card-title">{series.title}</div>

                  <div className="comic-card-meta">
                    {isUnnumberedIssue(issue.issue_number)
                      ? series.format_tag || (series.format_noun === "one-shot" ? "One-shot" : "Book")
                      : issue.issue_number ? `#${issue.issue_number}` : "Issue"}
                    {issue.title && issue.title !== series.title ? ` ${issue.title}` : ""}
                    {issue.release_year ? ` (${issue.release_year})` : ""}
                  </div>
                  {keyIssue?.reason && (
                    <div className="series-key-reason" title={keyIssue.reason}>
                      {keyIssue.reason}
                    </div>
                  )}
                </Link>
                {!markingMode && <div className="comic-card-actions series-issue-actions">
                  {!isOwned && !isWanted && (
                    user ? (
                      <>
                        <button
                          type="button"
                          className="comic-btn"
                          onClick={() => updateIssueLibrary(key, "owned")}
                        >
                          + Collection
                        </button>
                        <button
                          type="button"
                          className="comic-btn"
                          onClick={() => updateIssueLibrary(key, "wishlist")}
                        >
                          + Wantlist
                        </button>
                      </>
                    ) : (
                      <Link
                        href={`/signup?next=${encodeURIComponent(`/series/${id}`)}`}
                        className="comic-btn"
                      >
                        + Save
                      </Link>
                    )
                  )}
                  {(isOwned || isWanted) && (
                    <button
                      type="button"
                      className="comic-btn comic-btn-danger"
                      onClick={() => updateIssueLibrary(key, null)}
                    >
                      Remove
                    </button>
                  )}
                </div>}
              </article>
              );
            })}
          </div>
        )}
        {mutationError && <p className="series-mutation-error">{mutationError}</p>}
        {sortedIssues.length > shown && (
          <div ref={moreRef} className="series-more">
            <button type="button" onClick={() => setShown(sortedIssues.length)}>
              Show all {sortedIssues.length.toLocaleString("en-US")} issues
            </button>
          </div>
        )}
        {markingMode && selectedIssueIds.size > 0 && (
          <div className="run-quick-add-bar" role="region" aria-label="Add selected issues">
            <button type="button" onClick={handleRunAdd} disabled={runAdding}>
              {runAdding
                ? "Adding to your collection..."
                : `Add ${selectedIssueIds.size} to your collection`}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
