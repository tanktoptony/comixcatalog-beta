"use client";

import Link from "next/link";
import Image from "next/image";
import { avatarForProfile } from "@/lib/defaultAvatar";
import { forwardRef, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { groupByTitle, flattenGroups, titleFamily } from "@/lib/searchVariety";
import { parseSearchQuery } from "@/lib/searchQuery";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { SIGNUP_HREF as START_SIGNUP_HREF } from "@/app/start/StartClient";
import { useSearchQuery } from "@/context/SearchQueryContext";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { useSellerOrders } from "@/hooks/useSellerOrders";
import { inboxAriaLabel, inboxBadgeTotal } from "@/lib/inboxNotifications";
import { coverThumb } from "@/lib/coverThumb";
import InviteButton from "@/components/InviteButton";
import { authedFetch } from "@/lib/apiClient";
import { CircleHelp, Inbox, LibraryBig, Package, Store, Users } from "lucide-react";

const NAV_ICON_PROPS = { size: 20, strokeWidth: 1.75, "aria-hidden": true };

function routeIsCurrent(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

const NO_ROWS = [];
const NO_RESULTS = { q: null, rows: NO_ROWS };

export default function Header() {
  const { user, profile, loading, profileLoading, signOut, isPro, isPlus, hasSupporterPerks } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // The query lives in SearchQueryContext rather than local state so /search
  // can read what's being typed here and re-filter live. Off /search nothing
  // else consumes it and this behaves exactly like the local useState it
  // replaced. See src/context/SearchQueryContext.js for why it isn't
  // useSearchParams().
  const { query, setQuery } = useSearchQuery();
  // Each result set remembers the query it answers, so a section renders as
  // soon as its own request returns and never shows the previous query's rows.
  const [seriesFound, setSeriesFound] = useState(NO_RESULTS);
  const [comicsFound, setComicsFound] = useState(NO_RESULTS);
  const currentQuery = query.trim();
  const seriesResults = seriesFound.q === currentQuery ? seriesFound.rows : NO_ROWS;
  const titleRuns = seriesFound.q === currentQuery ? seriesFound.titleRuns ?? null : null;
  const comicResults = comicsFound.q === currentQuery ? comicsFound.rows : NO_ROWS;
  // Covers the debounce gap too, so "No results" never flashes between a
  // keystroke and its request.
  const awaitingResults = Boolean(currentQuery) && (seriesFound.q !== currentQuery || comicsFound.q !== currentQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const router = useRouter();
  const pathname = usePathname();

  // On /search the results are already on the page below the input, so the
  // suggestion dropdown would cover them with a shorter version of the same
  // thing. Suppress it there and let the page be the result list.
  const onSearchPage = pathname === "/search";
  const searchRef = useRef(null);
  // The panel is position:fixed so it can span the page instead of the
  // 520px search box. Fixed needs a real top, and the header is sticky with
  // a height that changes between breakpoints, so measure it.
  const [dropdownTop, setDropdownTop] = useState(null);
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

  // Switch-account: same signOut, different destination. Sends straight to
  // the login form instead of bouncing through the homepage — one click
  // less for the "log in as someone else" path. Uses window.location instead
  // of router.replace so the new page boots with a fully fresh auth state
  // (handy if the previous session's getSession seed in AuthContext is
  // still in flight).
  function handleSwitchAccount() {
    closeMenu();
    signOut();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  // Closes the panel. Results stay keyed to their query, so refocusing the
  // same query reopens them without another request.
  function dismissSuggestions() {
    setSearchOpen(false);
    setHighlightedIndex(-1);
  }

  function clearSearch() {
    setQuery("");
    dismissSuggestions();
  }

  // Pending until the destination page has rendered: the search box shows
  // a spinner so a picked result never looks like it did nothing.
  const [isNavigating, startNavigation] = useTransition();
  function handleNavigate(href) {
    clearSearch();
    closeMenu();
    startNavigation(() => router.push(href));
  }

  // Reset search chrome + the avatar dropdown whenever the route changes.
  // Adjusted during render (React's documented "reset state when a value
  // changes" pattern) instead of an effect — clearSearch/closeMenu are just
  // setState calls, safe to run conditionally mid-render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    // Landing on /search keeps the query — it IS that page's input now, and
    // blanking it would wipe the search the user just ran. The dropdown and
    // its results still get dismissed either way.
    if (onSearchPage) dismissSuggestions();
    else clearSearch();
    closeMenu();
  }

  useEffect(() => {
    if (!searchOpen) return undefined;
    const measure = () => {
      const box = searchRef.current?.getBoundingClientRect();
      if (box) setDropdownTop(Math.round(box.bottom + 10));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [searchOpen]);

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

    // On /search the dropdown is suppressed, so fetching its suggestions
    // would be two API calls per keystroke for something nobody sees — on
    // top of the page's own search running against the same query.
    if (onSearchPage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchLoading(false);
      return;
    }

    if (!q) {
      // Deliberately left as setState-in-effect: this branch is the guard
      // clause for the debounced fetch below it, not a standalone derived
      // reset — splitting it out into a render-time adjustment would
      // duplicate the "is query empty" check across two places and risk
      // the two falling out of sync. The fetch branch below already sets
      // state from an async callback, which is the sanctioned pattern.
      // (The rule is disabled once for this effect, on the /search guard
      // above; a second directive here would be flagged as unused.)
      setSearchLoading(false);
      return;
    }

    let cancelled = false;

    // Series and issues load independently: the dropdown used to wait for
    // the slower of the two before showing anything.
    const timeout = setTimeout(() => {
      setSearchLoading(true);
      let pending = 2;
      const settle = () => {
        pending -= 1;
        if (pending === 0 && !cancelled) setSearchLoading(false);
      };
      const load = (url, pick, store) => fetch(url, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled) return;
          const picked = pick(data);
          store({ q, ...(Array.isArray(picked) ? { rows: picked } : picked) });
          setSearchOpen(true);
        })
        .catch((err) => {
          console.error("Header search failed:", err);
          if (!cancelled) {
            store({ q, rows: NO_ROWS });
            setSearchOpen(true);
          }
        })
        .finally(settle);

      // 36, up from the old fixed 12. The API diversifies across distinct
      // runs before truncating, so a bigger number buys more DIFFERENT runs
      // rather than more of the same one; the dropdown shows the first five.
      load(
        `/api/search/series?q=${encodeURIComponent(q)}&limit=36`,
        (data) => ({
          rows: Array.isArray(data?.series) ? data.series.slice(0, 5) : NO_ROWS,
          titleRuns: data?.title_runs ?? null,
        }),
        setSeriesFound,
      );
      load(
        `/api/search/comics?q=${encodeURIComponent(q)}&limit=8&offset=0`,
        (data) => (Array.isArray(data?.comics)
          ? data.comics.map(mapComicResult).filter(Boolean).slice(0, 8)
          : NO_ROWS),
        setComicsFound,
      );
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, onSearchPage]);

  const hasResults = useMemo(() => {
    return seriesResults.length > 0 || comicResults.length > 0;
  }, [seriesResults, comicResults]);

  // The dropdown requests populate the term-level server cache. Prefetch the
  // matching RSC payload once results open so Enter/View all can reuse that
  // computation and navigation does not add another visible wait.
  useEffect(() => {
    const q = query.trim();
    if (!onSearchPage && searchOpen && hasResults && q) {
      router.prefetch(`/search?q=${encodeURIComponent(q)}`);
    }
  }, [hasResults, onSearchPage, query, router, searchOpen]);

  // Grouped for display, and flattened in the SAME order for keyboard
  // navigation. highlightedIndex is positional, so deriving the two from
  // different orders would highlight a different row than the cursor is on.
  const seriesGroups = useMemo(() => groupByTitle(seriesResults), [seriesResults]);
  const orderedSeries = useMemo(() => flattenGroups(seriesGroups), [seriesGroups]);

  const flatResults = useMemo(() => {
    const items = [];
    for (const s of orderedSeries) {
      if (!s?.id) continue;
      items.push({ key: `series-${s.id}`, href: `/series/${s.id}` });
    }
    for (const c of comicResults) {
      if (!c?.id) continue;
      const href = c.source === "user" ? `/comic/${c.id}` : `/issue/${c.id}`;
      items.push({ key: `comic-${c.id}`, href });
    }
    return items;
  }, [orderedSeries, comicResults]);

  // Reset the keyboard-highlighted result whenever the query or result sets
  // change — adjusted during render rather than in an effect, same pattern
  // as the pathname reset above.
  const [lastHighlightDeps, setLastHighlightDeps] = useState([query, seriesResults, comicResults]);
  if (
    lastHighlightDeps[0] !== query ||
    lastHighlightDeps[1] !== seriesResults ||
    lastHighlightDeps[2] !== comicResults
  ) {
    setLastHighlightDeps([query, seriesResults, comicResults]);
    setHighlightedIndex(-1);
  }

  function submitSearch() {
    const q = query.trim();
    if (!q) return;
    if (highlightedIndex >= 0 && flatResults[highlightedIndex]) {
      handleNavigate(flatResults[highlightedIndex].href);
      return;
    }
    // Already on /search: the page is filtering on this query as it's typed
    // and owns the URL, so navigating would be a round trip to where we are.
    // Just get the keyboard out of the way so the results are visible.
    if (onSearchPage) {
      dismissSuggestions();
      return;
    }
    handleNavigate(`/search?q=${encodeURIComponent(q)}`);
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
          </div>
        </Link>

        <div
          className={`header-search-wrap${isNavigating ? " is-loading" : ""}`}
          ref={searchRef}
          aria-busy={isNavigating}
        >
          {isNavigating && <span className="header-search-spinner" aria-hidden="true" />}
          <input
            className="header-search-input"
            type="text"
            placeholder={isNavigating ? "Opening…" : "Search comics"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (!onSearchPage && query.trim()) setSearchOpen(true);
            }}
            onKeyDown={handleSearchKeyDown}
          />

          {searchOpen && !onSearchPage && (
            <div
              className="header-search-dropdown"
              style={dropdownTop != null ? { top: `${dropdownTop}px` } : undefined}
            >
              {(searchLoading || awaitingResults) && !hasResults && (
                <div className="header-search-state">Searching…</div>
              )}

              {!searchLoading && !awaitingResults && !hasResults && query.trim() && (
                <div className="header-search-state">
                  No results for “{query}”.
                </div>
              )}

              {seriesGroups.length > 0 && (
                <div className="header-search-group">
                  <div className="header-search-group-title">Series</div>
                  {/* One cell per RUN, with its volumes inside. A collector
                      searching "batman" wants to see which runs exist, not
                      thirty-six rows that all say Batman. `flatIdx` counts
                      through the flattened order so the keyboard highlight
                      lands on the same row the cursor is over. */}
                  {(() => {
                    let flatIdx = -1;
                    return seriesGroups.map((group) => {
                      const totalRuns = titleRuns && titleFamily(titleRuns.title) === group.family
                        ? Number(titleRuns.count)
                        : 0;
                      const hasMoreRuns = totalRuns > group.rows.length;
                      return (
                      <div className="header-search-run" key={group.family || group.title}>
                        {(group.rows.length > 1 || hasMoreRuns) && (
                          <div className="header-search-run-title">
                            {group.title || "Untitled Series"}
                            <span className="header-search-run-count">
                              {hasMoreRuns ? `${group.rows.length} of ${totalRuns} runs` : `${group.rows.length} volumes`}
                            </span>
                            {hasMoreRuns && (
                              <Link
                                className="header-search-view-all"
                                href={`/search?q=${encodeURIComponent(titleRuns.title)}&runs=1`}
                                onClick={() => {
                                  clearSearch();
                                  closeMenu();
                                }}
                              >
                                See all
                              </Link>
                            )}
                          </div>
                        )}
                        {group.rows.map((series) => {
                          flatIdx += 1;
                          const idx = flatIdx;
                          const isActive = highlightedIndex === idx;
                          const grouped = group.rows.length > 1 || hasMoreRuns;
                          return (
                            <button
                              key={series.id}
                              type="button"
                              className={
                                grouped
                                  ? "header-search-item header-search-item--in-run"
                                  : "header-search-item"
                              }
                              style={isActive ? activeStyle : undefined}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                              onClick={() => handleNavigate(`/series/${series.id}`)}
                            >
                              <span className="header-search-thumb">
                                {series.cover ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={coverThumb(series.cover)}
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
                                    {grouped
                                      ? formatYearRange(series.year_start, series.year_end) ||
                                        series.title ||
                                        "Untitled Series"
                                      : series.title || "Untitled Series"}
                                  </span>
                                  {series.volume_index && series.volume_count > 1 ? (
                                    <span className="header-search-volume-tag">
                                      Vol. {series.volume_index}
                                    </span>
                                  ) : null}
                                  {series.format_tag && <span className={`pill ${series.format_collected ? "pill-format" : "pill-format-muted"}`} title={series.format_tag_title || undefined}>{series.format_tag}</span>}
                                </span>
                                <span className="header-search-item-meta">
                                  {[
                                    series.publisher?.name || "Unknown Publisher",
                                    grouped
                                      ? null
                                      : formatYearRange(series.year_start, series.year_end) || null,
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
                      );
                    });
                  })()}
                </div>
              )}

              {comicResults.length > 0 && (
                <div className="header-search-group">
                  <div className="header-search-group-title">Issues</div>
                  {comicResults.map((comic, i) => {
                    const href =
                      comic.source === "user"
                        ? `/comic/${comic.id}`
                        : `/issue/${comic.id}`;
                    const flatIdx = orderedSeries.length + i;
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
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={coverThumb(comic.cover)}
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
                  {!parseSearchQuery(query).format && (
                    <Link
                      href={`/search?q=${encodeURIComponent(`${query.trim()} trades`)}`}
                      className="header-search-view-all"
                      onClick={() => {
                        clearSearch();
                        closeMenu();
                      }}
                    >
                      Trades for &lsquo;{query.trim()}&rsquo;
                    </Link>
                  )}
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
          {user && (
            <Link
              href="/people"
              className="nav-icon-btn"
              aria-label="Collectors"
              data-label="Collectors"
              aria-current={routeIsCurrent(pathname, "/people") ? "page" : undefined}
              onClick={closeMenu}
            >
              <Users {...NAV_ICON_PROPS} />
            </Link>
          )}
          {/* Marketplace left the top bar on 2026-10-23 until real sellers
              are on it; it lives in the avatar menu and the footer. */}

          {!user && !loading && (
            <>
              <Link href="/login" className="nav-link nav-link-signin" onClick={closeMenu}>
                Sign in
              </Link>
              {/* On /start (the Instagram landing page) this goes through the
                  funnel's return path like the page's own CTAs, and is
                  tracked by StartTracker via data-start-cta. Elsewhere it is
                  unchanged. */}
              <Link
                href={pathname === "/start" ? START_SIGNUP_HREF : "/signup"}
                className="nav-cta"
                onClick={closeMenu}
                {...(pathname === "/start"
                  ? { "data-start-cta": "start_collection", "data-start-location": "header" }
                  : {})}
              >
                {/* Phones get the short label so Sign in fits beside it. */}
                <span className="nav-cta-label-full">Create account</span>
                <span className="nav-cta-label-short">Sign up</span>
              </Link>
            </>
          )}
        </nav>

        {/* Signed-in shortcuts remain visible at every header width. */}
        {/* While auth resolves (first paint of a full page load, before the
            stored session is read) hold the space the signed-in icons take,
            instead of flashing Sign in / Create account and then swapping. */}
        {!user && loading && <div className="header-user-actions header-auth-pending" aria-hidden="true" />}
        {user && (
          <div className="header-user-actions">
            <Link
              href="/library"
              className="nav-icon-btn"
              onClick={closeMenu}
              aria-label="Manage Collection"
              data-label="Library"
              aria-current={routeIsCurrent(pathname, "/library") ? "page" : undefined}
            >
              <LibraryBig {...NAV_ICON_PROPS} />
            </Link>
            <InboxNavButton current={routeIsCurrent(pathname, "/inbox")} />
            <UserMenu
              ref={userMenuRef}
              profileLoading={loading || profileLoading}
              open={userMenuOpen}
              setOpen={setUserMenuOpen}
              user={user}
              profile={profile}
              isPro={isPro}
              isPlus={isPlus}
              hasSupporterPerks={hasSupporterPerks}
              onLogout={handleLogout}
              onSwitchAccount={handleSwitchAccount}
              onNavigate={closeMenu}
            />
          </div>
        )}
      </div>
    </header>
  );
}

function InboxNavButton({ current }) {
  const unread = useUnreadMessageCount();
  const total = inboxBadgeTotal(unread);
  return (
    <Link
      href="/inbox"
      className="nav-icon-btn nav-icon-btn-inbox"
      aria-label={inboxAriaLabel(unread)}
      data-label="Inbox"
      aria-current={current ? "page" : undefined}
    >
      <Inbox {...NAV_ICON_PROPS} />
      {total > 0 && (
        <span className="nav-icon-badge" aria-hidden="true">
          {total > 99 ? "99+" : total}
        </span>
      )}
    </Link>
  );
}

function OrdersMenuItem({ onClick, orders }) {
  if (!orders.allowed) return null;
  return (
    <Link href="/orders" className="user-menu-item user-menu-item-with-icon" role="menuitem" onClick={onClick}>
      <Package {...NAV_ICON_PROPS} />
      <span>Orders</span>
      {orders.toShip > 0 && <span className="user-menu-count">{orders.toShip} to ship</span>}
    </Link>
  );
}

const UserMenu = forwardRef(function UserMenu(
  { open, setOpen, user, profile, profileLoading, isPro, isPlus, hasSupporterPerks, onLogout, onSwitchAccount, onNavigate },
  ref
) {
  const username = profile?.username || null;
  const orders = useSellerOrders(Boolean(user));
  // Email is the always-present source of truth from the auth user. The
  // dropdown header MUST identify the user — falling through to a bare
  // "Account" label (the previous behavior) made it impossible to tell
  // which account you were signed into.
  const email = user?.email ?? null;
  const displayName = profile?.display_name || username || email || "Account";
  // Right after sign-in there's no cached profile, so we know who you are
  // before we have your photo. Draw an empty circle while that read is in
  // flight; the stock badge is for a profile with no photo (or a failed
  // read), otherwise it flashes before the real one.
  const avatarSrc =
    !profile && profileLoading
      ? null
      : avatarForProfile({ ...profile, id: profile?.id || user?.id });

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
        aria-label={orders.toShip > 0 ? `Account menu, ${orders.toShip} ${orders.toShip === 1 ? "order" : "orders"} to ship` : "Account menu"}
      >
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt="" className="user-menu-avatar" />
        ) : (
          <span className="user-menu-avatar user-menu-avatar--pending" aria-hidden="true" />
        )}
        {hasSupporterPerks && <span className="user-menu-pro-dot" aria-hidden="true" />}
        {orders.toShip > 0 && (
          <span className="nav-icon-badge user-menu-ship-badge" aria-hidden="true">
            {orders.toShip > 9 ? "9+" : orders.toShip}
          </span>
        )}
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
            {isPlus && <span className="user-menu-pro-pill">Collector+</span>}
          </div>

          <div className="user-menu-divider" />

          <OrdersMenuItem onClick={handleItem()} orders={orders} />
          <Link href="/marketplace" className="user-menu-item user-menu-item-with-icon" role="menuitem" onClick={handleItem()}>
            <Store {...NAV_ICON_PROPS} />
            <span>Marketplace (beta)</span>
          </Link>
          <button
            type="button"
            className="user-menu-item user-menu-item-with-icon"
            role="menuitem"
            onClick={handleItem(() => window.dispatchEvent(new Event("cc:open-onboarding")))}
          >
            <CircleHelp {...NAV_ICON_PROPS} />
            <span>How this works</span>
          </button>

          <div className="user-menu-divider" />

          <Link
            href="/library"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem()}
          >
            Manage Collection
          </Link>
          <Link
            href="/people"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem()}
          >
            Find collectors
          </Link>
          {username && (
            <InviteButton
              username={username}
              ownerId={user?.id}
              className="user-menu-item"
              onShared={handleItem()}
            />
          )}
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
            href="/founding-collectors"
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

          {/* Account settings — change password, email, privacy, delete account.
              Distinct from the collector profile at /u/<username>. */}
          <Link
            href="/account"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem()}
          >
            Account settings
          </Link>

          <div className="user-menu-divider" />

          <Link
            href="/upgrade"
            className={`user-menu-item ${hasSupporterPerks ? "" : "user-menu-item-cta"}`}
            role="menuitem"
            onClick={handleItem()}
          >
            {hasSupporterPerks ? "Manage membership" : "Join Collector+"}
          </Link>

          <div className="user-menu-divider" />

          {/* Switch account: explicit affordance for the multi-account case.
              Uses handleSwitchAccount (signOut → /login) instead of the
              regular handleLogout (signOut → /). The previous inline
              `await onLogout()` was racing router.replace("/") against
              window.location.href = "/login" and you could land on either. */}
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={handleItem(onSwitchAccount)}
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
