"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function mapComicResult(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.id ?? null,
    title: row.series_title ?? row.title ?? "Untitled",
    issueNumber: row.issue_number ?? null,
    publisher: row.publisher ?? null,
    source: row.__source || "user",
  };
}

export default function Header() {
  const { user, profile, loading, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [seriesResults, setSeriesResults] = useState([]);
  const [comicResults, setComicResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef(null);

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleLogout() {
    closeMenu();
    const result = await signOut();
    if (result) {
      router.replace("/");
    }
  }

  function clearSearch() {
    setQuery("");
    setSeriesResults([]);
    setComicResults([]);
    setSearchOpen(false);
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
                  {seriesResults.map((series) => (
                    <button
                      key={series.id}
                      type="button"
                      className="header-search-item"
                      onClick={() => handleNavigate(`/series/${series.id}`)}
                    >
                      <span className="header-search-item-title">
                        {series.title || "Untitled Series"}
                      </span>
                      <span className="header-search-item-meta">
                        {series.publisher?.name || "Unknown Publisher"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {!searchLoading && comicResults.length > 0 && (
                <div className="header-search-group">
                  <div className="header-search-group-title">Issues</div>
                  {comicResults.map((comic) => {
                    const href =
                      comic.source === "user"
                        ? `/comic/${comic.id}`
                        : `/issue/${comic.id}`;

                    return (
                      <button
                        key={comic.id}
                        type="button"
                        className="header-search-item"
                        onClick={() => handleNavigate(href)}
                      >
                        <span className="header-search-item-title">
                          {comic.title}
                          {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                        </span>
                        <span className="header-search-item-meta">
                          {comic.publisher || "Unknown Publisher"}
                          {comic.source === "user" ? " · User Added" : ""}
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