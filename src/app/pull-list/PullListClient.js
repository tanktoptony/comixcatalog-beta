"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function monthName(value) {
  return MONTH.format(new Date(`${value}-01T00:00:00Z`));
}

function SeriesSearch({ onAdded }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/series?q=${encodeURIComponent(term)}&limit=5`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error("Search is unavailable right now.");
        setResults((body.series ?? []).filter((row) => row.gcd_id));
      } catch (searchError) {
        if (searchError.name !== "AbortError") setError(searchError.message);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function addSeries(row) {
    setBusyId(row.id);
    setError(null);
    try {
      const response = await authedFetch("/api/pull-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series_gcd_id: Number(row.gcd_id) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not add that series.");
      setQuery("");
      setResults([]);
      onAdded();
    } catch (addError) {
      setError(addError.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pull-add-series">
      <label htmlFor="pull-series-search">+ Add a series</label>
      <input
        id="pull-series-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (event.target.value.trim().length < 2) setResults([]);
        }}
        placeholder="Search series"
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul className="pull-search-results">
          {results.map((row) => (
            <li key={row.id}>
              <span>
                <strong>{row.title}</strong>
                <small>{[row.publisher?.name, row.year_start].filter(Boolean).join(" · ")}</small>
              </span>
              <button type="button" onClick={() => addSeries(row)} disabled={busyId === row.id}>
                {busyId === row.id ? "Adding…" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="pull-inline-error" role="alert">{error}</p>}
    </div>
  );
}

function IssueCard({ item, onSaved }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function save(status) {
    setBusy(status);
    setError(null);
    try {
      const response = await authedFetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rows: [{ i: 0, gcd_issue_id: item.gcd_issue_id }] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update your library.");
      onSaved(item.key, status);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(null);
    }
  }

  const title = `${item.series_title} #${item.issue_number}`;
  return (
    <article className={`pull-issue${item.owned ? " is-owned" : ""}`}>
      <div className="pull-cover-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.cover_url || "/fallback-cover.png"} alt="" />
      </div>
      {item.gcd_issue_id ? (
        <Link href={`/issue/${item.gcd_issue_id}`} className="pull-issue-title">{title}</Link>
      ) : (
        <strong className="pull-issue-title">{title}</strong>
      )}
      <span className="pull-issue-publisher">{item.publisher || "Publisher unknown"}</span>
      {item.gcd_issue_id ? (
        <div className="pull-issue-actions">
          {item.owned ? (
            <span className="pull-status">✓ In your collection</span>
          ) : item.wanted ? (
            <span className="pull-status">✓ On your wantlist</span>
          ) : (
            <>
              <button type="button" className="pull-action-primary" onClick={() => save("owned")} disabled={Boolean(busy)}>
                {busy === "owned" ? "Saving…" : "Got it"}
              </button>
              <button type="button" className="pull-action-secondary" onClick={() => save("wishlist")} disabled={Boolean(busy)}>
                {busy === "wishlist" ? "Saving…" : "Want"}
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="pull-unresolved">Not in the catalog yet</span>
      )}
      {error && <span className="pull-card-error" role="alert">{error}</span>}
    </article>
  );
}

export default function PullListClient() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    authedFetch("/api/pull-list", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load your pull list.");
        if (active) setData(body);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [authLoading, reload, user]);

  function retry() {
    setLoading(true);
    setError(null);
    setReload((value) => value + 1);
  }

  const upcomingByMonth = useMemo(() => {
    const groups = new Map();
    for (const item of data?.upcoming ?? []) {
      if (!groups.has(item.month)) groups.set(item.month, []);
      groups.get(item.month).push(item);
    }
    return [...groups.entries()];
  }, [data?.upcoming]);

  function saved(key, status) {
    setData((current) => ({
      ...current,
      weeks: current.weeks.map((week) => ({
        ...week,
        items: week.items.map((item) => item.key === key ? {
          ...item,
          owned: status === "owned" ? true : item.owned,
          wanted: status === "wishlist" ? true : item.wanted,
        } : item),
      })),
    }));
  }

  async function unfollow(seriesGcdId) {
    const previous = data;
    setData((current) => ({
      ...current,
      series: current.series.filter((row) => row.series_gcd_id !== seriesGcdId),
    }));
    try {
      const response = await authedFetch("/api/pull-list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series_gcd_id: seriesGcdId }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Could not remove that series.");
      }
      setReload((value) => value + 1);
    } catch (removeError) {
      setData(previous);
      setError(removeError.message);
    }
  }

  if (authLoading) return <main className="pull-page"><div className="pull-loading">Loading your pull list…</div></main>;
  if (!user) {
    return (
      <main className="pull-page pull-auth-state">
        <span className="pull-eyebrow">Your pull list</span>
        <h1>Never miss the next issue.</h1>
        <p>Follow the series you buy and every new issue lands here, week by week.</p>
        <div className="pull-auth-actions">
          <Link href="/signup?next=/pull-list" className="pull-action-primary">Sign up free</Link>
          <Link href="/login?next=/pull-list" className="pull-action-secondary">I have an account</Link>
        </div>
      </main>
    );
  }
  if (loading && !data) return <main className="pull-page"><div className="pull-loading">Loading your pull list…</div></main>;
  if (error && !data) {
    return <main className="pull-page"><div className="pull-error" role="alert"><p>{error}</p><button type="button" onClick={retry}>Try again</button></div></main>;
  }

  const hasSeries = data.series.length > 0;
  return (
    <main className="pull-page">
      <header className="pull-intro">
        <span className="pull-eyebrow">Your pull list</span>
        <h1>{hasSeries ? "New on your list" : "Your pull list"}</h1>
        <p>
          {hasSeries
            ? "New issues from the series you follow, as they land in the catalog. Tap Got it to add one to your collection, or Want to put it on your wantlist."
            : "Follow a series from its page and its new issues land here every week."}
        </p>
      </header>
      {error && <p className="pull-inline-error" role="alert">{error}</p>}
      <div className="pull-layout">
        <section className="pull-weeks" aria-label="Recent issues">
          {hasSeries && data.weeks.length === 0 && (
            <div className="pull-empty-releases">Nothing new from your series in the last six weeks.</div>
          )}
          {!hasSeries && (
            <div className="pull-empty">
              <Link href="/search">Find a series to follow</Link>
            </div>
          )}
          {data.weeks.map((week) => (
            <section className="pull-week" key={week.label_date}>
              <div className="pull-week-head">
                <h2>Out {SHORT_DATE.format(new Date(`${week.label_date}T00:00:00Z`))}</h2>
                <span>{week.items.length} on your list</span>
              </div>
              <div className="pull-issue-grid">
                {week.items.map((item) => <IssueCard key={item.key} item={item} onSaved={saved} />)}
              </div>
            </section>
          ))}
        </section>
        <aside className="pull-sidebar">
          <section className="pull-panel">
            <h2>Your series ({data.series.length})</h2>
            {data.series.length > 0 && (
              <ul className="pull-series-list">
                {data.series.map((row) => (
                  <li key={row.series_gcd_id}>
                    <Link href={`/series/${row.series_id}`}>{row.title}{row.year_start ? ` (${row.year_start})` : ""}</Link>
                    <button type="button" onClick={() => unfollow(row.series_gcd_id)} aria-label={`Remove ${row.title} from your pull list`}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <SeriesSearch onAdded={() => setReload((value) => value + 1)} />
          </section>
          {upcomingByMonth.map(([month, items]) => (
            <section className="pull-panel" key={month}>
              <h2>Coming in {monthName(month)}</h2>
              <ul className="pull-upcoming-list">
                {items.map((item) => (
                  <li key={`${month}:${item.series_title}:${item.issue_number}`}>
                    <span>{item.series_title} #{item.issue_number}</span>
                    <small>{SHORT_DATE.format(new Date(`${item.on_sale_date}T00:00:00Z`))}</small>
                  </li>
                ))}
              </ul>
              <p className="pull-footnote">On-sale dates from the Grand Comics Database.</p>
            </section>
          ))}
        </aside>
      </div>
    </main>
  );
}
