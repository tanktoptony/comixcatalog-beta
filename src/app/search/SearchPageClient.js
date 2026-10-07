"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLibrary } from "../../context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { useSearchQuery } from "@/context/SearchQueryContext";
import EmptyState from "@/components/EmptyState";
import { trackEvent } from "@/lib/analytics";
import AdSlot from "@/components/AdSlot";
import { SLOT } from "@/lib/houseAds";
import { coverThumb } from "@/lib/coverThumb";
import ComicResultCard from "@/components/ComicResultCard";
import CoverScanner from "@/components/CoverScanner";
import { compareIssueNumbers, normalizeTitle } from "@/lib/coverMatch";

const PAGE_SIZE = 36;

function resolveCoverUrl(rawCover) {
  if (!rawCover) return null;
  if (/^https?:\/\//i.test(rawCover)) return rawCover;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${rawCover}`;
}

function normalizeYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  if (n >= 1800 && n <= 2100) return Math.trunc(n);
  return null;
}

function formatYearRange(start, end) {
  const s = normalizeYear(start);
  const e = normalizeYear(end);
  if (!s) return "";
  if (!e || e === s) return String(s);
  return `${s}–${e}`;
}

function mapSupabaseComic(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id ?? null,
    seriesId: row.series_id ?? null,
    title: row.series_title ?? row.title ?? null,
    issueNumber: row.issue_number ?? null,
    year: row.release_year ?? null,
    publisher: row.publisher || null,
    issueCount: row.issue_count ?? null,
    cover: resolveCoverUrl(row.cover_path),
    __source: row.__source || "user",
    created_by: row.created_by ?? null,
  };
}

// ── Skeleton card ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <article className="comic-card" aria-hidden="true">
      <div
        className="comic-card-cover skeleton"
        style={{ aspectRatio: "2/3", borderRadius: 8 }}
      />
      <div className="skeleton" style={{ height: 14, margin: "10px 0 6px", borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 4 }} />
    </article>
  );
}

// initialQuery/initialComics/initialSeries come from the server render
// (src/app/search/page.js). null means the server did not have them and the
// client fetches as it always did.
export default function SearchPageClient({ initialQuery = "", initialComics = null, initialSeries = null } = {}) {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  // This page had its own <input> directly under the header's, so /search
  // showed two live search boxes. The header's is the one people use, but
  // only this one filtered results as you typed. Now the header's input is
  // this page's input: it writes to SearchQueryContext and we read it here.
  const { query, setQuery } = useSearchQuery();
  // What we search for. The box keeps exactly what was typed (a trailing
  // space mid-word is normal); every comparison and fetch uses the trimmed
  // term so "street fighter " is not a different search from "street fighter".
  const term = query.trim();
  const [page, setPage] = useState(0);

  // Seed the shared query from the URL, and re-seed on back/forward or a
  // fresh load of /search?q=… . Derived during render rather than in an
  // effect so there is no intermediate render showing the stale query.
  const [syncedUrlQuery, setSyncedUrlQuery] = useState(null);
  if (urlQuery !== syncedUrlQuery) {
    setSyncedUrlQuery(urlQuery);
    if (urlQuery.trim() !== term) setQuery(urlQuery);
  }

  // …and push it back, so the URL stays shareable. Debounced, and replacing
  // the entry: typing "batman" should not leave six history entries.
  // window.history.replaceState, not router.replace(): router.replace asked
  // the server to re-render /search (a full search, up to ~12s cold) for every
  // pause in typing, and when an older render landed late its URL re-seeded
  // the box above, wiping results back to skeletons in a loop. Next keeps
  // useSearchParams in sync with replaceState without a server round trip.
  useEffect(() => {
    if (term === urlQuery.trim()) return;
    const timeout = setTimeout(() => {
      window.history.replaceState(null, "", term ? `/search?q=${encodeURIComponent(term)}` : "/search");
    }, 400);
    return () => clearTimeout(timeout);
  }, [term, urlQuery]);

  const [supabaseComics, setSupabaseComics] = useState(initialComics ?? []);
  const [seriesResults, setSeriesResults] = useState(initialSeries ?? []);
  // The server already rendered page 0 for initialQuery; skip the one fetch
  // that would only repeat it. Any later query or page fetches normally.
  const skipComicsFetchFor = useRef(initialComics ? initialQuery : null);
  const skipSeriesFetchFor = useRef(initialSeries ? initialQuery : null);

  const [publisherFilter, setPublisherFilter] = useState(null);
  const [collectionFilter, setCollectionFilter] = useState("all");

  const [isLoading, setIsLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(Boolean(initialQuery) && !initialComics);
  const [loadError, setLoadError] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [hasMore, setHasMore] = useState(initialComics ? initialComics.length === PAGE_SIZE : true);

  const { wishlistIds, collectionIds, addToCollection, removeFromCollection } =
    useLibrary();
  const { user } = useAuth();

  // ── Fetch comics (browse or search) ─────────────────────────────────────────
  const awaitingUrlSeed = !term && Boolean(urlQuery.trim());
  const shownQuery = awaitingUrlSeed ? urlQuery.trim() : term;
  useEffect(() => {
    // On a fresh load of /search?q=… the shared query is still "" for the
    // first render (it is seeded from the URL above). Without this guard that
    // render fired the browse request (/api/comics, the slowest route on the
    // site) with no delay, for results that were thrown away a moment later.
    if (awaitingUrlSeed) return;
    if (!term) return;
    if (page === 0 && skipComicsFetchFor.current !== null && skipComicsFetchFor.current === term) {
      skipComicsFetchFor.current = null;
      return;
    }
    skipComicsFetchFor.current = null;

    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const url = `/api/search/comics?q=${encodeURIComponent(term)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;

        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        const data = await res.json();
        const comics = Array.isArray(data?.comics) ? data.comics : [];

        if (cancelled) return;

        // First page of a real query only — pagination is not a new search.
        if (page === 0) {
          trackEvent("search", {
            search_term: term,
            result_count: comics.length,
            logged_in: Boolean(user),
          });
        }

        setHasMore(comics.length === PAGE_SIZE);

        setSupabaseComics((prev) => {
          const merged = page === 0 ? comics : [...prev, ...comics];
          const deduped = [];
          const seen = new Set();
          for (const row of merged) {
            const key = String(row?.id ?? "");
            if (!key || seen.has(key)) continue;
            seen.add(key);
            deduped.push(row);
          }
          return deduped;
        });
      } catch (err) {
        console.error("Search comics load failed:", err);
        if (!cancelled) {
          setLoadError("Could not load comics right now. Please try again.");
          if (page === 0) setSupabaseComics([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsFirstLoad(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // `user` is read for the event only; re-fetching on auth changes would
    // double-load the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, page, awaitingUrlSeed]);

  // ── Reset page/filter on new query (keep old results visible until new ones arrive) ──
  // Same derive-during-render pattern as the URL sync above: reset paging
  // state the moment the query changes, before the fetch effect runs.
  // Seeded from the server's query first: the URL wins over whatever the
  // shared box held on arrival, so server results are never wiped and then
  // skipped (the skip refs above would leave the skeletons up forever).
  // Skipped while the box is still empty and waiting to be seeded from the
  // URL (arriving from the header, which clears its box as it navigates):
  // that one render is not a new search, and treating it as one wiped the
  // server's results, then the skip refs suppressed the refetch, leaving
  // twelve skeleton cards up forever.
  const [lastQuery, setLastQuery] = useState(initialQuery || term);
  if (!awaitingUrlSeed && term !== lastQuery) {
    setLastQuery(term);
    setPage(0);
    setHasMore(true);
    setLoadError(null);
    setPublisherFilter(null);
    setSupabaseComics([]);
    setSeriesResults([]);
    setIsFirstLoad(Boolean(term));
  }

  // ── Series suggestions ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!term) return;
    if (skipSeriesFetchFor.current !== null && skipSeriesFetchFor.current === term) {
      skipSeriesFetchFor.current = null;
      return;
    }
    skipSeriesFetchFor.current = null;

    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/series?q=${encodeURIComponent(term)}&limit=4`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`Series request failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setSeriesResults(Array.isArray(data?.series) ? data.series.filter(Boolean) : []);
        }
      } catch (err) {
        console.error("Series search failed:", err);
        if (!cancelled) setSeriesResults([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [term]);

  // ── Map + dedupe comics ──────────────────────────────────────────────────────
  const mappedComics = useMemo(() => {
    const mapped = supabaseComics.filter(Boolean).map(mapSupabaseComic).filter((item) => item && item.id);
    const deduped = [];
    const seen = new Set();
    for (const item of mapped) {
      const key = String(item.id);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }
    return deduped;
  }, [supabaseComics]);

  const orderedComics = useMemo(() => {
    const seriesRankById = new Map();
    const seriesRankByTitle = new Map();
    seriesResults.forEach((series, index) => {
      for (const id of [series?.id, series?.gcd_id]) {
        if (id != null) seriesRankById.set(String(id), index);
      }
      const title = normalizeTitle(series?.title);
      if (title && !seriesRankByTitle.has(title)) seriesRankByTitle.set(title, index);
    });
    const rank = (item) => seriesRankById.get(String(item.seriesId))
      ?? seriesRankByTitle.get(normalizeTitle(item.title))
      ?? Number.MAX_SAFE_INTEGER;

    return mappedComics.toSorted((a, b) => {
      const seriesDelta = rank(a) - rank(b);
      if (seriesDelta) return seriesDelta;
      return compareIssueNumbers(a.issueNumber, b.issueNumber);
    });
  }, [mappedComics, seriesResults]);

  // ── Dynamic publisher list from current results ──────────────────────────────
  const availablePublishers = useMemo(() => {
    const counts = {};
    for (const item of orderedComics) {
      const pub = (item.publisher || "").trim();
      if (!pub) continue;
      counts[pub] = (counts[pub] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }, [orderedComics]);

  // ── Apply collection/wishlist filters only (server already handled query+publisher) ──
  const results = useMemo(() => {
    let filtered = orderedComics;

    // Publisher filter (client-side on current page's results)
    if (publisherFilter) {
      filtered = filtered.filter((item) =>
        String(item.publisher || "").toLowerCase().includes(publisherFilter.toLowerCase())
      );
    }

    if (collectionFilter === "collection") {
      filtered = filtered.filter((item) => collectionIds.has(item.id));
    } else if (collectionFilter === "wishlist") {
      filtered = filtered.filter((item) => wishlistIds.has(item.id));
    }

    return filtered;
  }, [orderedComics, publisherFilter, collectionFilter, collectionIds, wishlistIds]);

  const togglePublisher = useCallback((pub) => {
    setPublisherFilter((prev) => (prev === pub ? null : pub));
  }, []);

  const toggleCollection = useCallback((val) => {
    setCollectionFilter((prev) => (prev === val ? "all" : val));
  }, []);

  if (!shownQuery) {
    return (
      <section className="comic-panel search-empty">
        <div className="section-label badge-x">Search</div>
        <h1 className="hero-title">Find Comics</h1>
        <p className="muted search-prompt">Search a title in the bar above, or scan a cover.</p>
        <CoverScanner />
      </section>
    );
  }

  return (
    <section className="comic-panel">
      <div className="section-label badge-x">Search</div>
      <h1 className="hero-title">Find Comics</h1>

      {/* The search input is the header's — see SearchQueryContext. */}

      {/* Series suggestions — grouped by title, divider between groups */}
      {seriesResults.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <h3 className="section-label">Series</h3>
          <div className="comic-grid search-series-grid">
            {seriesResults.filter((s) => s?.id).map((s) => {
                    const yearLabel = formatYearRange(s.year_start, s.year_end);
                    return (
                      <Link prefetch={false}
                        key={s.id}
                        href={`/series/${s.id}`}
                        className="comic-card"
                        onClick={() =>
                          trackEvent("search_result_click", {
                            result_type: "series_match",
                            result_id: s.id,
                            search_term: term,
                          })
                        }
                      >
                        <div className="comic-card-cover">
                          {s.cover && (
                            <img src={coverThumb(s.cover)} alt={s.title || ""} />
                          )}
                        </div>
                        <div className="comic-card-title">
                          {s.title || "Untitled Series"}
                        </div>
                        <div className="comic-card-meta">
                          {[
                            s.publisher?.name || "Unknown Publisher",
                            yearLabel,
                            s.issue_count != null ? `${s.issue_count} issues` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </Link>
                    );
                  })}
          </div>
        </div>
      )}

      <h2 className="section-label search-issues-heading">Issues</h2>

      {/* Filter bar */}
      <div className="filter-bar">
        {/* Dynamic publisher filters from actual results */}
        {availablePublishers.map((pub) => (
          <button
            key={pub}
            className={`filter-btn ${publisherFilter === pub ? "active" : ""}`}
            onClick={() => togglePublisher(pub)}
          >
            {pub}
          </button>
        ))}

        {/* Divider if publishers exist */}
        {availablePublishers.length > 0 && (
          <span style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "0 4px" }} />
        )}

        <button
          className={`filter-btn ${collectionFilter === "collection" ? "active" : ""}`}
          onClick={() => toggleCollection("collection")}
        >
          In My Collection
        </button>

        <button
          className={`filter-btn ${collectionFilter === "wishlist" ? "active" : ""}`}
          onClick={() => toggleCollection("wishlist")}
        >
          Wishlist
        </button>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="empty-state" style={{ color: "rgba(255,100,100,0.9)" }}>
          {loadError}
        </div>
      )}

      {/* Result count */}
      {!isFirstLoad && !loadError && (
        <p className="muted">
          {results.length} result{results.length === 1 ? "" : "s"}
          {` for "${shownQuery}"`}
          {publisherFilter ? ` · ${publisherFilter}` : ""}
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !loadError && !isFirstLoad && results.length === 0 && (
        <EmptyState
            icon="🔍"
            title={`No results for "${shownQuery}"`}
            body="Try a broader search, fewer words, or check the spelling. Series titles are the most reliable way to find an issue."
            secondary={{ href: "/search", label: "Clear search" }}
          />
      )}

      {/* Comic grid */}
      <div className="comic-grid">
        {/* Skeleton cards on first load */}
        {isFirstLoad &&
          Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}

        {/* Real results */}
        {!isFirstLoad &&
          results.map((item, index) => {
            if (item.id) {
              return <ComicResultCard key={item.id} item={item} index={index} query={term} onMutationError={setMutationError} />;
            }
            const isSeries = item.__source === "series";
            const isUserAdded = item.__source === "user";
            const inCollection = !isSeries && collectionIds.has(item.id);
            const inWishlist = !isSeries && wishlistIds.has(item.id);
            const coverSrc = item.cover || "/fallback-cover.png";
            const comicHref = isSeries
              ? `/series/${item.seriesId}`
              : isUserAdded
              ? `/comic/${item.id}`
              : `/issue/${item.id}`;

            return (
              <article key={item.id} className="comic-card">
                <Link prefetch={false}
                  href={comicHref}
                  className="card-link"
                  onClick={() =>
                    trackEvent("search_result_click", {
                      result_type: isSeries ? "series" : isUserAdded ? "comic" : "issue",
                      result_id: item.id,
                      search_term: term,
                      position: index,
                    })
                  }
                >
                  <div className="comic-card-cover">
                    <img
                      src={coverThumb(coverSrc)}
                      alt={item.title || "Comic cover"}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/fallback-cover.png";
                      }}
                    />
                  </div>

                  <div className="comic-card-title">
                    {item.title || "Untitled"}
                    {item.issueNumber ? ` #${item.issueNumber}` : ""}
                  </div>

                  <div className="comic-card-meta">
                    {isSeries
                      ? [
                          item.publisher,
                          item.year,
                          item.issueCount ? `${item.issueCount} issues` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Unknown"
                      : [item.publisher, item.year].filter(Boolean).join(" · ") ||
                        "Unknown"}
                  </div>

                  {isUserAdded && (
                    <span className="pill pill-new">User Added</span>
                  )}
                </Link>

                {!isSeries && (
                  <div className="comic-card-pills">
                    {inCollection && (
                      <span className="pill pill-collection">In Collection</span>
                    )}
                    {inWishlist && (
                      <span className="pill pill-wishlist">On Wishlist</span>
                    )}
                  </div>
                )}

                {!isSeries && (
                  <div className="comic-card-actions">
                    {!inCollection && !inWishlist && (
                      user ? (
                        <>
                          <button
                            className="comic-btn"
                            onClick={() => addToCollection(item.id, "owned")}
                          >
                            + Collection
                          </button>
                          <button
                            className="comic-btn"
                            onClick={() => addToCollection(item.id, "wishlist")}
                          >
                            + Wantlist
                          </button>
                        </>
                      ) : (
                        // Anon: route to signup with a return path. Beats
                        // disabled buttons with hover-only tooltip — anon
                        // visitors on touch devices never see those.
                        <Link
                          href={`/signup?next=${encodeURIComponent("/search")}`}
                          className="comic-btn"
                          style={{ textDecoration: "none", textAlign: "center" }}
                        >
                          + Save
                        </Link>
                      )
                    )}

                    {inCollection && (
                      <button
                        className="comic-btn comic-btn-danger"
                        onClick={async () => {
                          const result = await removeFromCollection(item.id, { scope: "latest-copy" });
                          setMutationError(result?.ok === false ? result.error || "Library update failed" : null);
                        }}
                      >
                        Remove
                      </button>
                    )}

                    {inWishlist && (
                      <button
                        className="comic-btn comic-btn-danger"
                        onClick={async () => {
                          const result = await removeFromCollection(item.id, { scope: "wishlist" });
                          setMutationError(result?.ok === false ? result.error || "Library update failed" : null);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        {/* House-ad row, pinned by CSS to grid row 3 (after two full rows of
            results at any column count). */}
        {!isFirstLoad && results.length > 0 && (
          <AdSlot position={SLOT.SEARCH_INLINE_1} pageKey={shownQuery} className="ad-slot--row3" />
        )}

        {/* Inline skeleton cards while loading more */}
        {isLoading &&
          !isFirstLoad &&
          Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={`more-${i}`} />
          ))}
      </div>
      {mutationError && <p style={{ color: "#ff8a80" }}>{mutationError}</p>}

      {/* Load more */}
      {hasMore && !isLoading && !isFirstLoad && results.length > 0 && (
        <div style={{ marginTop: "24px", textAlign: "center" }}>
          <button className="comic-btn" onClick={() => setPage((p) => p + 1)}>
            Load More
          </button>
        </div>
      )}
    </section>
  );
}
