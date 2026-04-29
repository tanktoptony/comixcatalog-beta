"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Featured series carousel for the homepage. Pulls from /api/comics (same
// curated browse endpoint as /search no-query). Horizontal scroll with
// chevron controls — Discogs-pattern. 8 tiles per fetch.

const TILE_WIDTH = 200; // matches CSS .featured-card flex-basis

export default function FeaturedCarousel() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const railRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/comics?limit=12&offset=0", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled) {
          setSeries(Array.isArray(data?.comics) ? data.comics : []);
        }
      } catch {
        if (!cancelled) setSeries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function scroll(direction) {
    const rail = railRef.current;
    if (!rail) return;
    const delta = (TILE_WIDTH + 16) * 3 * direction;
    rail.scrollBy({ left: delta, behavior: "smooth" });
  }

  if (!loading && series.length === 0) return null;

  return (
    <section className="featured-section" aria-label="Featured series">
      <div className="featured-header">
        <div>
          <p className="featured-kicker">This week</p>
          <h2 className="featured-title">Featured series</h2>
        </div>
        <div className="featured-controls">
          <button
            type="button"
            className="featured-chevron"
            aria-label="Scroll left"
            onClick={() => scroll(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="featured-chevron"
            aria-label="Scroll right"
            onClick={() => scroll(1)}
          >
            ›
          </button>
        </div>
      </div>

      <div className="featured-rail" ref={railRef}>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <article
                key={`sk-${i}`}
                className="featured-card featured-card-skel"
                aria-hidden="true"
              >
                <div className="featured-cover-skel" />
                <div className="featured-text-skel" />
                <div className="featured-text-skel short" />
              </article>
            ))
          : series.map((s) => {
              const seriesId = s.series_id ?? null;
              const href = seriesId ? `/series/${seriesId}` : "#";
              const cover = s.cover_path || "/fallback-cover.png";
              return (
                <Link key={s.id} href={href} className="featured-card">
                  <div className="featured-cover">
                    <img
                      src={cover}
                      alt={s.series_title || "Series"}
                      loading="lazy"
                    />
                  </div>
                  <div className="featured-meta">
                    <div className="featured-name">
                      {s.series_title || "Untitled"}
                    </div>
                    <div className="featured-sub">
                      {[s.publisher, s.release_year, s.issue_count ? `${s.issue_count} issues` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>
    </section>
  );
}
