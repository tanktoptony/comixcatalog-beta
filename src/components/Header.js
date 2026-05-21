"use client";

import Link from "next/link";
import Image from "next/image";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";

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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [seriesResults, setSeriesResults] = useState([]);
  const [comicResults, setComicResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef(null);
  const userMenuRef = useRef(null);

  function closeMenu() {
    // Closes the avatar dropdown when navigating. The hamburger menu it
    // used to manage is gone, but every nav link still calls this on click,
    // which is the right behavior for collapsing the avatar dropdown.
    setUserMenuOpen(false);
  }

  function handleLogout() {
    closeMenu();
    // signOut() clears user/profile synchronously (before its first await) so
    // the navbar paints as logged-out the moment React processes the next
    // tick. Then we navigate. The network signOut runs in the background.
    signOut();
    router.replace("/");
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
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }
    function handleEsc(event) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEsc);
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

        {/* Inline header navigation. The hamburger is gone — for logged-in
            users the avatar dropdown handles overflow, and for logged-out
            users the Sign-in / Create-account links shrink to icons on the
            narrowest widths via CSS. Always single-row, no wrapping. */}
        <nav className="main-nav" aria-label="Primary">
          <Link
            href="/search"
            className="nav-icon-btn"
            onClick={closeMenu}
            title="Browse"
            aria-label="Browse"
          >
            <BrowseIcon />
          </Link>
          <Link
            href="/marketplace"
            className="nav-icon-btn"
            onClick={closeMenu}
            title="Marketplace"
            aria-label="Marketplace"
          >
            <MarketplaceIcon />
          </Link>

          {!user && (
            <>
              <Link href="/login" className="nav-link nav-link-mobile-hide" onClick={closeMenu}>
                Sign in
              </Link>
              <Link href="/signup" className="nav-cta" onClick={closeMenu}>
                Create account
              </Link>
            </>
          )}
        </nav>

        {/* Library icon + avatar dropdown live OUTSIDE .main-nav so they stay
            visible on mobile while text links collapse behind the hamburger.
            Inbox slot is reserved — messaging v1 is wallpapered off while we
            focus on data ingestion. Re-enable by swapping back to InboxNavButton. */}
        {user && (
          <div className="header-user-actions">
            <button
              type="button"
              className="nav-icon-btn nav-icon-btn-disabled"
              title="Inbox (coming soon)"
              aria-label="Inbox (coming soon)"
              disabled
            >
              <InboxIcon />
            </button>

            <Link
              href="/library"
              className="nav-icon-btn"
              onClick={closeMenu}
              title="My Library"
              aria-label="My Library"
            >
              <LibraryIcon />
            </Link>
            <UserMenu
              ref={userMenuRef}
              open={userMenuOpen}
              setOpen={setUserMenuOpen}
              user={user}
              profile={profile}
              isPro={isPro}
              onLogout={handleLogout}
              onNavigate={closeMenu}
            />
          </div>
        )}
      </div>
    </header>
  );
}

function LibraryIcon() {
  // Stack-of-books icon, currentColor for theming.
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h4v16H4z" />
      <path d="M9 4h4v16H9z" />
      <path d="M15 5l3.5-1 3 14-3.5 1z" />
    </svg>
  );
}

function InboxNavButton() {
  const unread = useUnreadMessageCount();
  return (
    <Link
      href="/inbox"
      className="nav-icon-btn nav-icon-btn-inbox"
      title="Inbox"
      aria-label={unread > 0 ? `Inbox (${unread} unread)` : "Inbox"}
    >
      <InboxIcon />
      {unread > 0 && (
        <span className="nav-icon-badge" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

function InboxIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 13h4l2 3h6l2-3h4" />
      <path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
    </svg>
  );
}

function BrowseIcon() {
  // Compass-style explore icon — denotes "browse / discover".
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

function MarketplaceIcon() {
  // Storefront / shop icon.
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

const UserMenu = forwardRef(function UserMenu(
  { open, setOpen, user, profile, isPro, onLogout, onNavigate },
  ref
) {
  const username = profile?.username || null;
  // Email is the always-present source of truth from the auth user. The
  // dropdown header MUST identify the user — falling through to a bare
  // "Account" label (the previous behavior) made it impossible to tell
  // which account you were signed into.
  const email = user?.email ?? null;
  const displayName = profile?.display_name || username || email || "Account";
  const avatarSrc = profile?.avatar_url
    ? profile.avatar_url
    : `/avatars/${profile?.avatar_key || "cc_badge"}.png`;

  function handleItem(callback) {
    return () => {
      setOpen(false);
      onNavigate?.();
      callback?.();
    };
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className={`user-menu-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <img src={avatarSrc} alt="" className="user-menu-avatar" />
        {isPro && <span className="user-menu-pro-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-head">
            <div className="user-menu-name">{displayName}</div>
            {username && displayName !== username && (
              <div className="user-menu-handle">@{username}</div>
            )}
            {/* Always show email when it's not already the displayName.
                This is the line that tells you WHICH account you're on —
                non-negotiable for users who switch between dev + real accounts. */}
            {email && email !== displayName && (
              <div
                className="user-menu-handle"
                style={{ opacity: 0.7, fontSize: "0.85em" }}
                title={email}
              >
                {email}
              </div>
            )}
            {isPro && <span className="user-menu-pro-pill">PRO</span>}
          </div>

          <div className="user-menu-divider" />

          {username && (
            <Link
              href={`/u/${username}`}
              className="user-menu-item"
              role="menuitem"
              onClick={handleItem()}
            >
              My Profile
            </Link>
          )}
          <Link
            href="/library"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem()}
          >
            My Library
          </Link>
          <Link
            href="/collectors"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem()}
          >
            Founding Collectors
          </Link>
          <Link
            href="/blog"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem()}
          >
            Developer Blog
          </Link>

          <div className="user-menu-divider" />

          <Link
            href="/upgrade"
            className={`user-menu-item ${isPro ? "" : "user-menu-item-cta"}`}
            role="menuitem"
            onClick={handleItem()}
          >
            {isPro ? "Manage Pro" : "Upgrade to Pro"}
          </Link>

          <div className="user-menu-divider" />

          {/* Switch account: explicit affordance for the multi-account case.
              The old flow required Sign Out → land on /, then navigate to
              /login. This collapses that to one click + auto-redirects so
              the next session starts in the login form, ready for credentials. */}
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem(async () => {
              await onLogout?.();
              if (typeof window !== "undefined") {
                window.location.href = "/login";
              }
            })}
          >
            Switch account
          </button>
          <button
            type="button"
            className="user-menu-item user-menu-item-danger"
            role="menuitem"
            onClick={handleItem(onLogout)}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
});