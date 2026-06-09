"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Replaces the generic EmptyState on /library when a user has zero owned
// items in their collection. The activation moment: instead of an "all
// empty" wall, give the user a search box (the primary action) and a
// gallery of popular series they can jump into.
//
// Pulled from /api/comics, which already returns the curated weekly-rotated
// FEATURED_SERIES list with cover paths. If the fetch fails (rare), we
// fall back to a plain search prompt — never block the user.
export default function FirstRunLibrary() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/comics?limit=6", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.comics)) {
          setSuggestions(data.comics.slice(0, 6));
        }
      })
      .catch(() => {
        // Silently — the search box is enough on its own.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSearchSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      router.push("/search");
    } else {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <div className="first-run-library">
      <div className="first-run-hero">
        <div className="first-run-icon" aria-hidden="true">📚</div>
        <h2 className="first-run-title">Add your first comic</h2>
        <p className="first-run-body">
          Search any series or issue, then track grades, values, and what you&rsquo;re hunting for.
        </p>

        <form className="first-run-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            className="first-run-search-input"
            placeholder="Search 217k+ series — Absolute Batman, Saga, Amazing Spider-Man…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            aria-label="Search comic series and issues"
          />
          <button type="submit" className="first-run-search-btn">
            Search
          </button>
        </form>

        <div className="first-run-secondary">
          <Link href="/library/add" className="first-run-secondary-link">
            Or add a comic manually →
          </Link>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="first-run-suggestions">
          <div className="first-run-suggestions-label">
            Or jump into a popular series
          </div>
          <div className="first-run-suggestion-grid">
            {suggestions.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.series_id}`}
                className="first-run-suggestion-card"
              >
                <div className="first-run-suggestion-cover">
                  {s.cover_path ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={s.cover_path} alt={s.series_title} loading="lazy" />
                  ) : (
                    <div className="first-run-suggestion-fallback">📖</div>
                  )}
                </div>
                <div className="first-run-suggestion-meta">
                  <div className="first-run-suggestion-title">{s.series_title}</div>
                  {s.release_year && (
                    <div className="first-run-suggestion-year">{s.release_year}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
