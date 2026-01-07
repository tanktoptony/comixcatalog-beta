"use client";

export default function IssueHero({
  item,
  inWishlist,
  inCollection,
  onToggleWishlist,
  onToggleCollection,
  burstLabel,
}) {
  return (
    <div className="issue-hero">
      {/* COVER */}
      <div className="issue-cover-frame relative">
        {burstLabel && (
          <div className="absolute top-2 left-2 z-10">
            <span className="bg-yellow-400 text-black font-bold text-xs px-2 py-1 rounded-md shadow">
              {burstLabel}
            </span>
          </div>
        )}

        <img
          src={`/covers/${item.cover}`}
          alt={item.title}
          className="issue-cover-img"
        />
      </div>

      {/* CONTROLS */}
      <div className="issue-controls mt-6">
        <div className="issue-status-row">
          <span
            className={`comic-pill ${
              inCollection ? "comic-pill-collection" : ""
            }`}
          >
            {inCollection ? "In Collection" : "Not in Collection"}
          </span>

          <span
            className={`comic-pill ${inWishlist ? "comic-pill-wishlist" : ""}`}
          >
            {inWishlist ? "On Wishlist" : "Not on Wishlist"}
          </span>
        </div>

        <div className="issue-actions">
          <button
            onClick={() => onToggleCollection(item.id)}
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
      </div>
    </div>
  );
}
