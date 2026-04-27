"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function resolveCoverUrl(rawCover) {
  if (!rawCover) return null;
  if (/^https?:\/\//i.test(rawCover)) return rawCover;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${rawCover}`;
}

function mapComicResult(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.id ?? null,
    title: row.series_title ?? row.title ?? "Untitled",
    issueNumber: row.issue_number ?? null,
    publisher: row.publisher ?? null,
    releaseYear: row.release_year ?? null,
    source: row.__source || "user",
    cover: resolveCoverUrl(row.cover_path),
  };
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

export default function Header() {
  const { user, profile, loading, signOut, isPro } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [seriesResults, setSeriesResults] = useState([]);
  const [comicResults, setComicResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef(null);

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleLogout() {
    closeMenu();
    try {
      await signOut();
    } catch (err) {
      console.error("Logout failed:", err);
    }
    window.location.replace("/");
  }

  function clearSearch() {
    setQuery("");
    setSeriesResults([]);
    setComicResults([]);
    setSearchOpen(false);
    setHighlightedIndex(-1);
  }

  function handleNavigate(href) {
    clearSearch();
    closeMenu();
    router.push(href);
  }

  useEffect(() => {
    clearSearch();
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();

    if (!q) {
      setSeriesResults([]);
      setComicResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;

    const timeout = setTimeout(async () => {
      try {
        setSearchLoading(true);

        const [seriesRes, comicsRes] = await Promise.all([
          fetch(`/api/search/series?q=${encodeURIComponent(q)}`, {
            cache: "no-store",
          }),
          fetch(`/api/search/comics?q=${encodeURIComponent(q)}&limit=8&offset=0`, {
            cache: "no-store",
          }),
        ]);

        const [seriesData, comicsData] = await Promise.all([
          seriesRes.ok ? seriesRes.json() : { series: [] },
          comicsRes.ok ? comicsRes.json() : { comics: [] },
        ]);

        if (cancelled) return;

        const series = Array.isArray(seriesData?.series) ? seriesData.series : [];
        const comics = Array.isArray(comicsData?.comics)
          ? comicsData.comics.map(mapComicResult).filter(Boolean)
          : [];

        setSeriesResults(series.slice(0, 5));
        setComicResults(comics.slice(0, 8));
        setSearchOpen(true);
      } catch (err) {
        console.error("Header search failed:", err);
        if (!cancelled) {
          setSeriesResults([]);
          setComicResults([]);
          setSearchOpen(true);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const hasResults = useMemo(() => {
    return seriesResults.length > 0 || comicResults.length > 0;
  }, [seriesResults, comicResults]);

  const flatResults = useMemo(() => {
    const items = [];
    for (const s of seriesResults) {
      if (!s?.id) continue;
      items.push({ key: `series-${s.id}`, href: `/series/${s.id}` });
    }
    for (const c of comicResults) {
      if (!c?.id) continue;
      const href = c.source === "user" ? `/comic/${c.id}` : `/issue/${c.id}`;
      items.push({ key: `comic-${c.id}`, href });
    }
    return items;
  }, [seriesResults, comicResults]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query, seriesResults, comicResults]);

  function submitSearch() {
    const q = query.trim();
    if (!q) return;
    if (highlightedIndex >= 0 && flatResults[highlightedIndex]) {
      handleNavigate(flatResults[highlightedIndex].href);
    } else {
      handleNavigate(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  function handleSearchKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatResults.length === 0) return;
      setSearchOpen(true);
      setHighlightedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submitSearch();
    } else if (e.key === "Escape") {
      setSearchOpen(false);
      setHighlightedIndex(-1);
    }
  }

  const activeStyle = { background: "rgba(255,255,255,0.08)" };

  if (loading && !user) {
    return null;
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="ComixCatalog home">
          <Image
            src="/img/logos/cc_badge.png"
            alt="ComixCatalog badge"
            width={40}
            height={40}
            className="logo-badge"
            priority
          />
          <div className="brand-block">
            <div className="brand-title">
              <span className="brand-main">COMIXCATALOG</span>
            </div>
            <div className="brand-sub">Catalog. Collect. Connect.</div>
          </div>
        </Link>

        <div className="header-search-wrap" ref={searchRef}>
          <input
            className="header-search-input"
            type="text"
            placeholder="Search series, issues, characters..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (query.trim()) setSearchOpen(true);
            }}
            onKeyDown={handleSearchKeyDown}
          />

          {searchOpen && (
            <div className="header-search-dropdown">
              {searchLoading && (
                <div className="header-search-state">Searching…</div>
              )}

              {!searchLoading && !hasResults && query.trim() && (
                <div className="header-search-state">
                  No results for “{query}”.
                </div>
              )}

              {!searchLoading && seriesResults.length > 0 && (
                <div className="header-search-group">
                  <div className="header-search-group-title">Series</div>
                  {seriesResults.map((series, i) => {
                    const flatIdx = i;
                    const isActive = highlightedIndex === flatIdx;
                    return (
                    <button
                      key={series.id}
                      type="button"
                      className="header-search-item"
                      style={isActive ? activeStyle : undefined}
                      onMouseEnter={() => setHighlightedIndex(flatIdx)}
                      onClick={() => handleNavigate(`/series/${series.id}`)}
                    >
                      <span className="header-search-thumb">
                        {series.cover ? (
                          <img
                            src={series.cover}
                            alt=""
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                      </span>
                      <span className="header-search-item-body">
                        <span className="header-search-item-title-row">
                          <span className="header-search-item-title">
                            {series.title || "Untitled Series"}
                          </span>
                          {series.volume_index && series.volume_count > 1 ? (
                            <span className="header-search-volume-tag">
                              Vol. {series.volume_index}
                            </span>
                          ) : null}
                        </span>
                        <span className="header-search-item-meta">
                          {[
                            series.publisher?.name || "Unknown Publisher",
                            formatYearRange(series.year_start, series.year_end) || null,
                            series.issue_count
                              ? `${series.issue_count} issue${series.issue_count === 1 ? "" : "s"}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                    );
                  })}
                </div>
              )}

              {!searchLoading && comicResults.length > 0 && (
                <div className="header-search-group">
                  <div className="header-search-group-title">Issues</div>
                  {comicResults.map((comic, i) => {
                    const href =
                      comic.source === "user"
                        ? `/comic/${comic.id}`
                        : `/issue/${comic.id}`;
                    const flatIdx = seriesResults.length + i;
                    const isActive = highlightedIndex === flatIdx;

                    return (
                      <button
                        key={comic.id}
                        type="button"
                        className="header-search-item"
                        style={isActive ? activeStyle : undefined}
                        onMouseEnter={() => setHighlightedIndex(flatIdx)}
                        onClick={() => handleNavigate(href)}
                      >
                        <span className="header-search-thumb">
                          {comic.cover ? (
                            <img
                              src={comic.cover}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : null}
                        </span>
                        <span className="header-search-item-body">
                          <span className="header-search-item-title">
                            {comic.title}
                            {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                          </span>
                          <span className="header-search-item-meta">
                            {[
                              comic.publisher || "Unknown Publisher",
                              comic.releaseYear ? String(comic.releaseYear) : null,
                              comic.source === "user" ? "User Added" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {query.trim() && (
                <div className="header-search-footer">
                  <Link
                    href={`/search?q=${encodeURIComponent(query)}`}
                    className="header-search-view-all"
                    onClick={() => {
                      clearSearch();
                      closeMenu();
                    }}
                  >
                    View all results
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          className="nav-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`main-nav ${menuOpen ? "open" : ""}`}>
          <Link href="/marketplace" className="nav-link" onClick={closeMenu}>
            Marketplace
          </Link>

          <Link href="/library" className="nav-link" onClick={closeMenu}>
            My Library
          </Link>

          <Link href="/blog" className="nav-link" onClick={closeMenu}>
            Developer Blog
          </Link>

          <Link href="/search" className="nav-link" onClick={closeMenu}>
            Browse
          </Link>

          <Link href="/collectors" className="nav-link" onClick={closeMenu}>
            Founding Collectors
          </Link>

          {!user && (
            <>
              <Link href="/login" className="nav-link" onClick={closeMenu}>
                Login
              </Link>
              <Link href="/signup" className="nav-link" onClick={closeMenu}>
                Sign Up
              </Link>
            </>
          )}

          {user && (
            <>
              {isPro && (
                <Link
                  href="/upgrade"
                  className="nav-pro-pill"
                  onClick={closeMenu}
                  title="Manage your Pro subscription"
                >
                  PRO
                </Link>
              )}

              {profile?.username && (
                <Link
                  href={`/u/${profile.username}`}
                  className="nav-link"
                  onClick={closeMenu}
                >
                  My Profile
                </Link>
              )}

              <button type="button" onClick={handleLogout} className="nav-link">
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}