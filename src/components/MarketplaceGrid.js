"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { coverThumb } from "@/lib/coverThumb";
import { conditionLabel, offerHref, formatValue } from "@/lib/marketplaceFormat";

// Listings grid for /marketplace: client-side search, sort and paging over
// the server-rendered list (src/lib/marketplace.js).

const PAGE = 48;

export default function MarketplaceGrid({ listings }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? listings.filter((l) =>
          `${l.title} ${l.issueNumber} ${l.publisher ?? ""} ${l.seller}`.toLowerCase().includes(needle)
        )
      : listings.slice();
    if (sort === "value-desc") list.sort((a, b) => (b.estValue ?? -1) - (a.estValue ?? -1));
    if (sort === "value-asc") list.sort((a, b) => (a.estValue ?? Infinity) - (b.estValue ?? Infinity));
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title) || String(a.issueNumber).localeCompare(String(b.issueNumber), undefined, { numeric: true }));
    return list;
  }, [listings, q, sort]);

  return (
    <div className="mkt-browse">
      <div className="mkt-toolbar">
        <input
          type="search"
          className="mkt-search"
          placeholder="Search listings: title, publisher, seller…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setShown(PAGE);
          }}
          aria-label="Search listings"
        />
        <select className="mkt-sort" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort listings">
          <option value="newest">Newest</option>
          <option value="value-desc">Value: high to low</option>
          <option value="value-asc">Value: low to high</option>
          <option value="title">Title</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="mkt-empty">No listings match “{q}”.</p>
      ) : (
        <div className="mkt-grid">
          {filtered.slice(0, shown).map((l) => (
            <article key={l.id} className="mkt-card">
              <Link prefetch={false} href={l.href} className="mkt-card-cover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverThumb(l.cover || "/fallback-cover.png")} alt={`${l.title} #${l.issueNumber}`} loading="lazy" />
                <span className="mkt-card-grade">{conditionLabel(l)}</span>
              </Link>
              <div className="mkt-card-body">
                <Link prefetch={false} href={l.href} className="mkt-card-title">
                  {l.title}
                  {l.issueNumber ? ` #${l.issueNumber}` : ""}
                </Link>
                <div className="mkt-card-sub">{[l.publisher, l.year].filter(Boolean).join(" · ")}</div>
                <div className="mkt-card-price">
                  {formatValue(l.estValue) ? (
                    <>
                      <b>{formatValue(l.estValue)}</b> <span>est. value</span>
                    </>
                  ) : (
                    <span>Open to offers</span>
                  )}
                </div>
                <div className="mkt-card-foot">
                  <Link prefetch={false} href={`/u/${encodeURIComponent(l.seller)}`} className="mkt-card-seller">
                    @{l.seller}
                  </Link>
                  <Link prefetch={false} href={offerHref(l)} className="mkt-offer-btn">
                    Make an offer
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {shown < filtered.length && (
        <button type="button" className="mkt-more" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({filtered.length - shown} left)
        </button>
      )}
    </div>
  );
}
