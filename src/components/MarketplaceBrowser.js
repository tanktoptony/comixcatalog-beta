"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { coverThumb } from "@/lib/coverThumb";
import { conditionLabel, offerHref, formatValue } from "@/lib/marketplaceFormat";
import {
  FILTER_KEYS,
  SORTS,
  facetCounts,
  filterLabel,
  filterListings,
  isBrowsing,
  landingSections,
  paginate,
  readFilters,
  sortListings,
} from "@/lib/marketplaceFacets";

// /marketplace, Discogs style. With no search or filter it's a short landing
// page of shelves (just listed, most wanted, most valuable, publishers, top
// sellers). Searching or picking any filter switches to browse mode: facet
// sidebar with live counts, a compact one-row-per-copy list, sort, pages.
// All state lives in the URL so back/forward and shared links just work.

const FACET_TITLES = {
  publisher: "Publisher",
  series: "Series",
  format: "Format",
  grade: "Grade",
  decade: "Decade",
  price: "Price",
};

function hrefWith(params, changes) {
  const next = new URLSearchParams(params.toString());
  for (const [k, v] of Object.entries(changes)) {
    if (v == null || v === "") next.delete(k);
    else next.set(k, v);
  }
  // Any change other than paging goes back to page one; a new publisher
  // clears the series picked under the old one.
  if (!("page" in changes)) next.delete("page");
  if ("publisher" in changes) next.delete("series");
  const qs = next.toString();
  return qs ? `/marketplace?${qs}` : "/marketplace";
}

function priceText(l) {
  if (l.price != null) return { main: formatValue(l.price), note: null };
  if (l.estValue != null) return { main: formatValue(l.estValue), note: "est." };
  return { main: null, note: "Make an offer" };
}

function Price({ l }) {
  const p = priceText(l);
  return (
    <span className="mk-price">
      {p.main && <b>{p.main}</b>}
      {p.note && <em>{p.note}</em>}
    </span>
  );
}

function Card({ l }) {
  return (
    <li className="mk-card">
      <Link prefetch={false} href={l.href} className="mk-card-cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverThumb(l.cover || "/fallback-cover.png")} alt={`${l.title} #${l.issueNumber}`} loading="lazy" />
      </Link>
      <Link prefetch={false} href={l.href} className="mk-card-title">
        {l.title} #{l.issueNumber || "?"}
      </Link>
      <span className="mk-card-meta">
        {conditionLabel(l)}
        {l.year ? ` · ${l.year}` : ""}
      </span>
      <Price l={l} />
    </li>
  );
}

function Shelf({ title, items, more, note }) {
  if (!items.length) return null;
  return (
    <section className="mk-shelf">
      <div className="mk-shelf-head">
        <h2>{title}</h2>
        {note && <span className="mk-shelf-note">{note}</span>}
        {more && (
          <Link prefetch={false} href={more} className="mk-more">
            See all
          </Link>
        )}
      </div>
      <ul className="mk-cards">
        {items.map((l) => (
          <Card key={l.id} l={l} />
        ))}
      </ul>
    </section>
  );
}

function Landing({ listings, params }) {
  const s = landingSections(listings);
  return (
    <div className="mk-landing">
      <Shelf title="Just listed" items={s.justListed} more={hrefWith(params, { view: "all", sort: "newest" })} />

      <section className="mk-shelf">
        <div className="mk-shelf-head">
          <h2>Shop by publisher</h2>
        </div>
        <ul className="mk-pubs">
          {s.publishers.map(([p, n]) => (
            <li key={p}>
              <Link prefetch={false} href={hrefWith(params, { publisher: p })}>
                <span>{filterLabel("publisher", p)}</span>
                <em>{n.toLocaleString("en-US")}</em>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Shelf title="Most wanted" note="On the most wantlists right now" items={s.mostWanted} />
      <Shelf title="Most valuable" items={s.mostValuable} more={hrefWith(params, { view: "all", sort: "value-desc" })} />

      {s.sellers.length > 0 && (
        <section className="mk-shelf">
          <div className="mk-shelf-head">
            <h2>Top sellers</h2>
          </div>
          <ul className="mk-sellers">
            {s.sellers.map(([name, n]) => (
              <li key={name}>
                <Link prefetch={false} href={`/u/${encodeURIComponent(name)}?tab=for_sale`}>
                  <span>@{name}</span>
                  <em>
                    {n.toLocaleString("en-US")} book{n === 1 ? "" : "s"}
                  </em>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Facet({ name, entries, selected, params }) {
  const [open, setOpen] = useState(false);
  if (!entries?.length) return null;
  const LIMIT = 8;
  const shown = open || entries.length <= LIMIT ? entries : entries.slice(0, LIMIT);
  return (
    <div className="mk-facet">
      <h3>{FACET_TITLES[name]}</h3>
      <ul>
        {shown.map(([value, n]) => {
          const on = selected === value;
          return (
            <li key={value}>
              <Link
                prefetch={false}
                scroll={false}
                href={hrefWith(params, { [name]: on ? null : value })}
                className={on ? "is-on" : ""}
                aria-current={on ? "true" : undefined}
              >
                <span>{filterLabel(name, value)}</span>
                <em>{n.toLocaleString("en-US")}</em>
              </Link>
            </li>
          );
        })}
      </ul>
      {entries.length > LIMIT && (
        <button type="button" className="mk-facet-more" onClick={() => setOpen((v) => !v)}>
          {open ? "Show less" : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}

function Row({ l }) {
  return (
    <li className="mk-row">
      <Link prefetch={false} href={l.href} className="mk-row-cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverThumb(l.cover || "/fallback-cover.png")} alt="" loading="lazy" />
      </Link>
      <div className="mk-row-main">
        <Link prefetch={false} href={l.href} className="mk-row-title">
          {l.title} #{l.issueNumber || "?"}
        </Link>
        <span className="mk-row-meta">
          {[l.publisher ? filterLabel("publisher", l.publisher) : null, l.year, l.variant].filter(Boolean).join(" · ")}
        </span>
        <span className="mk-row-sub">
          <span className="mk-cond">{conditionLabel(l)}</span>
          <Link prefetch={false} href={`/u/${encodeURIComponent(l.seller)}`} className="mk-row-seller">
            @{l.seller}
          </Link>
        </span>
      </div>
      <div className="mk-row-buy">
        <Price l={l} />
        <Link prefetch={false} href={offerHref(l)} className="mk-offer">
          Make an offer
        </Link>
      </div>
    </li>
  );
}

function Pager({ page, pages, params }) {
  if (pages <= 1) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <nav className="mk-pager" aria-label="Pages">
      {page > 1 && <Link prefetch={false} href={hrefWith(params, { page: page - 1 })}>Previous</Link>}
      {nums.map((n, i) => (
        <span key={n}>
          {i > 0 && n - nums[i - 1] > 1 && <span className="mk-gap">…</span>}
          {n === page ? (
            <b aria-current="page">{n}</b>
          ) : (
            <Link prefetch={false} href={hrefWith(params, { page: n })}>{n}</Link>
          )}
        </span>
      ))}
      {page < pages && <Link prefetch={false} href={hrefWith(params, { page: page + 1 })}>Next</Link>}
    </nav>
  );
}

function Browse({ listings, f, params }) {
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const counts = facetCounts(listings, f);
  const results = sortListings(filterListings(listings, f), f.sort, f.q);
  const { items, page, pages, total } = paginate(results, f.page);
  const active = FILTER_KEYS.filter((k) => f[k]);

  return (
    <div className="mk-browse">
      <aside className={`mk-side${filtersOpen ? " is-open" : ""}`} aria-label="Filters">
        {FILTER_KEYS.map((k) => (
          <Facet key={k} name={k} entries={counts[k]} selected={f[k]} params={params} />
        ))}
      </aside>

      <section className="mk-results">
        <div className="mk-bar">
          <p className="mk-count">
            <b>{total.toLocaleString("en-US")}</b> {total === 1 ? "copy" : "copies"}
            {f.q ? <> for &ldquo;{f.q}&rdquo;</> : null}
          </p>
          <button type="button" className="mk-filters-btn" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
            Filters{active.length ? ` (${active.length})` : ""}
          </button>
          <label className="mk-sort">
            <span>Sort</span>
            <select value={f.sort} onChange={(e) => router.push(hrefWith(params, { sort: e.target.value }), { scroll: false })}>
              {Object.entries(SORTS).filter(([v]) => v !== "relevance" || f.q).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(active.length > 0 || f.q) && (
          <div className="mk-chips">
            {f.q && (
              <Link prefetch={false} scroll={false} href={hrefWith(params, { q: null })}>
                &ldquo;{f.q}&rdquo; <span aria-hidden="true">×</span>
              </Link>
            )}
            {active.map((k) => (
              <Link key={k} prefetch={false} scroll={false} href={hrefWith(params, { [k]: null })}>
                {filterLabel(k, f[k])} <span aria-hidden="true">×</span>
              </Link>
            ))}
            <Link prefetch={false} scroll={false} href="/marketplace?view=all" className="mk-clear">
              Clear all
            </Link>
          </div>
        )}

        {items.length === 0 ? (
          <p className="mk-empty">Nothing matches. Try removing a filter.</p>
        ) : (
          <ul className="mk-rows">
            {items.map((l) => (
              <Row key={l.id} l={l} />
            ))}
          </ul>
        )}
        <Pager page={page} pages={pages} params={params} />
      </section>
    </div>
  );
}

function SearchBox({ f, params }) {
  const router = useRouter();
  return (
    <form
      className="mk-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
        router.push(hrefWith(params, { q: q || null, view: q ? null : "all" }));
      }}
    >
      <input
        key={f.q}
        name="q"
        type="search"
        defaultValue={f.q}
        placeholder="Search by title, issue, or seller"
        aria-label="Search the marketplace"
      />
      <button type="submit">Search</button>
    </form>
  );
}

function MarketplaceView({ listings, params }) {
  const f = readFilters(params);
  const browsing = isBrowsing(f) || params.get("view") === "all";
  const sellers = new Set(listings.map((l) => l.seller)).size;

  return (
    <div className="mk">
      <header className="mk-head">
        <div className="mk-head-row">
          <h1>
            {browsing ? (
              <Link prefetch={false} href="/marketplace">
                Marketplace
              </Link>
            ) : (
              "Marketplace"
            )}
            <span className="mk-beta">Beta</span>
          </h1>
          <Link href="/library?tab=for_sale" className="mk-sell">
            Sell from your collection
          </Link>
        </div>
        <SearchBox f={f} params={params} />
        {!browsing && listings.length > 0 && (
          <p className="mk-stats">
            {listings.length.toLocaleString("en-US")} comic{listings.length === 1 ? "" : "s"} for sale from{" "}
            {sellers.toLocaleString("en-US")} collector{sellers === 1 ? "" : "s"}.{" "}
            <Link prefetch={false} href="/marketplace?view=all">
              Browse everything
            </Link>
            <span className="mk-dot">·</span>No fees during the beta.
          </p>
        )}
      </header>

      {listings.length === 0 ? (
        <p className="mk-empty">
          Nothing listed yet. Be the first: open your <Link href="/library">library</Link> and mark a book for sale.
        </p>
      ) : browsing ? (
        <Browse listings={listings} f={f} params={params} />
      ) : (
        <Landing listings={listings} params={params} />
      )}
    </div>
  );
}

function WithParams({ listings }) {
  const params = useSearchParams();
  return <MarketplaceView listings={listings} params={params} />;
}

// The page is statically rendered; the landing view doubles as the
// fallback so the HTML has real content before the URL is read.
export default function MarketplaceBrowser({ listings }) {
  return (
    <Suspense fallback={<MarketplaceView listings={listings} params={new URLSearchParams()} />}>
      <WithParams listings={listings} />
    </Suspense>
  );
}
