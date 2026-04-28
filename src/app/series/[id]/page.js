"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

function issueSortValue(issueNumber) {
  // Comics often store dual-numbered issues like "30 (471)" (Vol 2 / Vol 1
  // legacy numbering — Spider-Man, Fantastic Four, X-Men all do this), or
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

export default function SeriesPage() {
  const { id } = useParams();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState("issue-asc");

  useEffect(() => {
    if (!id) return;

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

  return (
    <main className="page-wrapper">
      <section className="comic-panel">
        <div className="section-label badge-x">Series</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            gap: "24px",
            alignItems: "start",
            marginBottom: "28px",
          }}
        >
          <div className="issue-cover-frame" style={{ maxWidth: 220 }}>
            <img
              src={series.featured_cover || "/fallback-cover.png"}
              alt={series.title}
              className="issue-cover-img"
            />
          </div>

          <div>
            <h1 className="hero-title" style={{ marginBottom: "10px" }}>
              {series.title}
            </h1>

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
              <span className="pill">Series Page</span>
              <span className="pill">Canonical Run</span>
            </div>

            <p className="muted" style={{ maxWidth: "760px" }}>
              Browse the run, jump into exact issues, and eventually compare copies
              for sale tied to the canonical issue page.
            </p>
          </div>
        </div>


        <div
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
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label htmlFor="sortMode" className="muted">
              Sort
            </label>
            <select
              id="sortMode"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
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
            {sortedIssues.map((issue) => (
              <article key={issue.id} className="comic-card">
                <Link href={`/issue/${issue.id}`} className="card-link">
                  <div className="comic-card-cover">
                    <img
                      src={issue.cover || "/fallback-cover.png"}
                      alt={`${series.title} #${issue.issue_number}`}
                      loading="lazy"
                    />
                  </div>

                  <div className="comic-card-title">
                    {series.title}
                    {issue.issue_number ? ` #${issue.issue_number}` : ""}
                  </div>

                  {issue.title && issue.title !== series.title && (
                    <div className="comic-card-meta" style={{ marginBottom: 4 }}>
                      {issue.title}
                    </div>
                  )}

                  <div className="comic-card-meta">
                    {issue.release_year || "Unknown Year"}
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}