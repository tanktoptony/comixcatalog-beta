"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { coverThumb } from "@/lib/coverThumb";

export default function FirstRunLibrary() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [seriesMatches, setSeriesMatches] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/comics?limit=6", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data?.comics)) {
          setSuggestions(data.comics.slice(0, 6));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search/series?q=${encodeURIComponent(q)}&limit=5`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((data) => setSeriesMatches(Array.isArray(data?.series) ? data.series : []))
        .catch((error) => {
          if (error.name !== "AbortError") setSeriesMatches([]);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    const q = query.trim();
    if (q.length >= 2 && seriesMatches[0]?.id) {
      router.push(`/series/${seriesMatches[0].id}?own=1`);
      return;
    }
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <div className="first-run-library">
      <div className="first-run-hero">
        <div className="first-run-icon" aria-hidden="true">📚</div>
        <h2 className="first-run-title">Add a run you own</h2>
        <p className="first-run-body">
          Find a series, then tap a range or every issue you have.
        </p>

        <form className="first-run-search" onSubmit={handleSearchSubmit} role="search">
          <input
            type="search"
            className="first-run-search-input"
            placeholder="Search series, like Uncanny X-Men"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim().length < 2) setSeriesMatches([]);
            }}
            autoFocus
            aria-label="Search comic series"
          />
          <button type="submit" className="first-run-search-btn">
            Find series
          </button>
        </form>

        {query.trim().length >= 2 && seriesMatches.length > 0 && (
          <div className="first-run-series-matches">
            {seriesMatches.slice(0, 5).map((match) => (
              <Link key={match.id} href={`/series/${match.id}?own=1`}>
                <strong>{match.title}</strong>
                <span>
                  {match.resolved_publisher_cached || "Publisher unknown"}
                  {match.year_start_cached ? ` · ${match.year_start_cached}` : ""}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="first-run-paths">
          <Link href="/scan" className="first-run-path-card">
            <strong>Scan covers</strong>
            <span>Use your camera to identify covers and add the matches.</span>
          </Link>
          <Link href="/library#csv-import" className="first-run-path-card">
            <strong>Import a spreadsheet</strong>
            <span>Upload a CSV to bring in a list you already keep.</span>
          </Link>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="first-run-suggestions">
          <div className="first-run-suggestions-label">Or jump into a popular series</div>
          <div className="first-run-suggestion-grid">
            {suggestions.map((suggestion) => (
              <Link
                prefetch={false}
                key={suggestion.id}
                href={`/series/${suggestion.series_id}?own=1`}
                className="first-run-suggestion-card"
              >
                <div className="first-run-suggestion-cover">
                  {suggestion.cover_path ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={coverThumb(suggestion.cover_path)}
                      alt={suggestion.series_title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="first-run-suggestion-fallback">📖</div>
                  )}
                </div>
                <div className="first-run-suggestion-meta">
                  <div className="first-run-suggestion-title">
                    {suggestion.series_title}
                  </div>
                  {suggestion.release_year && (
                    <div className="first-run-suggestion-year">
                      {suggestion.release_year}
                    </div>
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
