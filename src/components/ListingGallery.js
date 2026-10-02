"use client";

import { useState } from "react";

// The listing page's images: the seller's own photos first (lead photo
// big), the catalog cover last so buyers can compare the copy with the
// reference. With no seller photos it's just the catalog cover.
export default function ListingGallery({ photos = [], cover, title }) {
  const items = [
    ...photos.map((p) => ({ key: p.id, full: p.url, thumb: p.thumbUrl, label: p.label })),
    ...(cover ? [{ key: "catalog", full: cover, thumb: cover, label: "Catalog cover" }] : []),
  ];
  const [active, setActive] = useState(0);
  const shown = items[active] ?? items[0];
  if (!shown) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="lg-main" src="/fallback-cover.png" alt={title} />;
  }

  return (
    <div className="lg">
      <a href={shown.full} target="_blank" rel="noreferrer" className="lg-main-wrap" title="Open full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="lg-main" src={shown.full} alt={`${title}: ${shown.label}`} />
        {photos.length > 0 && <span className="lg-tag">{shown.key === "catalog" ? "Catalog cover" : `Seller photo · ${shown.label}`}</span>}
      </a>
      {items.length > 1 && (
        <ul className="lg-thumbs">
          {items.map((it, i) => (
            <li key={it.key}>
              <button type="button" onClick={() => setActive(i)} className={i === active ? "is-on" : ""} aria-label={it.label} aria-pressed={i === active}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
