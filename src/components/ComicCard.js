"use client";

import Link from "next/link";
import { SERIES_FULL_NAMES } from "../data/seriesFullNames";

export default function ComicCard({
  item,
  inWishlist,
  inCollection,
  onToggleWishlist,
  onToggleCollection,
}) {
  return (
    <article className="comic-card hover:ring-2 hover:ring-yellow-400/40 transition">
      <Link href={`/comic/${item.id}`} className="block">
        {/* COVER */}
        <div className="comic-card-cover">
          <img
            src={item.cover_url || "/fallback-cover.png"}
            alt={item.title || "Comic cover"}
            className="comic-cover"
          />
        </div>

        {/* TEXT INFO */}
        <div className="comic-card-body">
          <h3 className="comic-card-title">
            {(SERIES_FULL_NAMES[item.series] || item.series) +
              " #" +
              (item.issue_number || "TBD")}
          </h3>

          <div className="comic-card-meta">
            {(item.year || "Year TBD") + " · " + (item.creator || "TBD")}
          </div>
        </div>
      </Link>

      {/* PILLS */}
      <div className="comic-card-pills">
        {inCollection && (
          <span className="comic-pill comic-pill-collection">
            In Collection
          </span>
        )}
        {inWishlist && (
          <span className="comic-pill comic-pill-wishlist">On Wishlist</span>
        )}
      </div>

      {/* BUTTONS */}
      <div className="comic-card-actions">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleCollection(item.id);
          }}
          className="comic-btn comic-btn-collection"
        >
          {inCollection ? "Remove from Collection" : "Add to Collection"}
        </button>

        <button
          onClick={() => onToggleWishlist(item.id)}
          className="comic-btn comic-btn-wishlist"
        >
          {inWishlist ? "Remove from Wishlist" : "Add to Wishlist"}
        </button>
      </div>
    </article>
  );
}
