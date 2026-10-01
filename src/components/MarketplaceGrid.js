"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { coverThumb } from "@/lib/coverThumb";
import { conditionLabel, offerHref, formatValue } from "@/lib/marketplaceFormat";

// Listings for /marketplace, grouped by publisher and then by title, with
// issues in number order inside each title. Search, a publisher filter and
// the sort all run client-side over the server-rendered list
// (src/lib/marketplace.js).

const SORTS = [
  ["title", "A–Z"],
  ["value-desc", "Value ↓"],
  ["value-asc", "Value ↑"],
  ["newest", "Newest"],
];

const OTHER = "Other publishers";

const issueOrder = (a, b) =>
  String(a.issueNumber).localeCompare(String(b.issueNumber), undefined, { numeric: true });

function groupListings(list, sort) {
  const byPub = new Map();
  for (const l of list) {
    const pub = l.publisher || OTHER;
    if (!byPub.has(pub)) byPub.set(pub, new Map());
    const byTitle = byPub.get(pub);
    if (!byTitle.has(l.title)) byTitle.set(l.title, []);
    byTitle.get(l.title).push(l);
  }
  // Titles inside a publisher follow the chosen sort (by their best book);
  // A–Z is plain alphabetical.
  const titleScore = (items) => {
    if (sort === "value-desc") return -Math.max(...items.map((i) => i.estValue ?? -1));
    if (sort === "value-asc") return Math.min(...items.map((i) => i.estValue ?? Infinity));
    if (sort === "newest") return -Math.max(...items.map((i) => Date.parse(i.listedAt) || 0));
    return 0;
  };
  return [...byPub.entries()]
    .map(([publisher, titles]) => ({
      publisher,
      count: [...titles.values()].reduce((n, items) => n + items.length, 0),
      titles: [...titles.entries()]
        .map(([title, items]) => ({ title, items: items.slice().sort(issueOrder) }))
        .sort((a, b) => titleScore(a.items) - titleScore(b.items) || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => b.count - a.count || a.publisher.localeCompare(b.publisher));
}

export default function MarketplaceGrid({ listings }) {
  const [q, setQ] = useState("");
  const [publisher, setPublisher] = useState("all");
  const [sort, setSort] = useState("title");

  const publishers = useMemo(() => {
    const counts = new Map();
    for (const l of listings) {
      const p = l.publisher || OTHER;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [listings]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = listings.filter((l) => {
      if (publisher !== "all" && (l.publisher || OTHER) !== publisher) return false;
      if (!needle) return true;
      return `${l.title} #${l.issueNumber} ${l.publisher ?? ""} ${l.seller}`.toLowerCase().includes(needle);
    });
    return groupListings(list, sort);
  }, [listings, q, publisher, sort]);

  const shownCount = groups.reduce((n, g) => n + g.count, 0);

  return (
    <div className="mkt-browse">
      <div className="mkt-bar">
        <label className="mkt-bar-search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="Search title, issue, or seller"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search listings"
          />
        </label>
        <div className="mkt-seg" role="group" aria-label="Sort listings">
          {SORTS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={sort === value ? "is-on" : ""}
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {publishers.length > 1 && (
        <div className="mkt-chips" role="group" aria-label="Filter by publisher">
          <button
            type="button"
            className={publisher === "all" ? "is-on" : ""}
            aria-pressed={publisher === "all"}
            onClick={() => setPublisher("all")}
          >
            All <span>{listings.length}</span>
          </button>
          {publishers.map(([p, n]) => (
            <button
              key={p}
              type="button"
              className={publisher === p ? "is-on" : ""}
              aria-pressed={publisher === p}
              onClick={() => setPublisher(p)}
            >
              {p.replace(/ Comics$/, "")} <span>{n}</span>
            </button>
          ))}
        </div>
      )}

      {shownCount === 0 ? (
        <p className="mkt-empty">No listings match{q ? ` “${q}”` : ""}.</p>
      ) : (
        groups.map((g) => (
          <section key={g.publisher} className="mkt-pub" aria-label={g.publisher}>
            <header className="mkt-pub-head">
              <h2>{g.publisher}</h2>
              <span>
                {g.count} book{g.count === 1 ? "" : "s"} · {g.titles.length} title{g.titles.length === 1 ? "" : "s"}
              </span>
            </header>
            <div className="mkt-shelves">
            {g.titles.map((t) => (
              <div key={t.title} className="mkt-run">
                <h3 className="mkt-run-title">
                  {t.title} <span>{t.items.length}</span>
                </h3>
                <div className="mkt-grid">
                  {t.items.map((l) => (
                    <article key={l.id} className="mkt-card">
                      <Link prefetch={false} href={l.href} className="mkt-card-cover">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={coverThumb(l.cover || "/fallback-cover.png")} alt={`${l.title} #${l.issueNumber}`} loading="lazy" />
                        <span className="mkt-card-grade">{conditionLabel(l)}</span>
                      </Link>
                      <div className="mkt-card-body">
                        <Link prefetch={false} href={l.href} className="mkt-card-title">
                          #{l.issueNumber || "?"}
                          {l.year ? <span className="mkt-card-year"> · {l.year}</span> : null}
                        </Link>
                        <div className="mkt-card-price">
                          {formatValue(l.estValue) ? (
                            <>
                              <b>{formatValue(l.estValue)}</b> <span>est.</span>
                            </>
                          ) : (
                            <span>Open to offers</span>
                          )}
                        </div>
                        <Link prefetch={false} href={`/u/${encodeURIComponent(l.seller)}`} className="mkt-card-seller">
                          @{l.seller}
                        </Link>
                        <Link prefetch={false} href={offerHref(l)} className="mkt-offer-btn">
                          Make an offer
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
