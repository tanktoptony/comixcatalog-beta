import Link from "next/link";
import { notFound } from "next/navigation";
import ShareProfileButton from "@/components/ShareProfileButton";
import { headers } from "next/headers";

export default async function PublicProfilePage({ params }) {
  const { username } = await params;

  if (!username) {
    notFound();
  }

  const headersList = await headers();
  const host = headersList.get("host");

  if (!host) {
    throw new Error("Host header missing");
  }

  const protocol =
    process.env.NODE_ENV === "development" ? "http" : "https";

  const res = await fetch(
    `${protocol}://${host}/api/public-profile?username=${username}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    notFound();
  }

  const { collection } = await res.json();

  // --------------------
  // STAT CALCULATIONS
  // --------------------

  const totalBooks = collection.length;

  const ownedCount = collection.filter(
    (c) => c.status === "owned"
  ).length;

  const wishlistCount = collection.filter(
    (c) => c.status === "wishlist"
  ).length;

  // Publisher counts (FIXED)
  const publisherCounts = {};

  collection.forEach((item) => {
    const publisher = item.comics?.publisher;

    if (!publisher) return;

    publisherCounts[publisher] =
      (publisherCounts[publisher] || 0) + 1;
  });

  const sortedPublishers = Object.entries(publisherCounts)
    .sort((a, b) => b[1] - a[1]);

  const topPublisher = sortedPublishers[0]?.[0] || "Unknown";
  const topPublisherCount = sortedPublishers[0]?.[1] || 0;

  const uniquePublishers = Object.keys(publisherCounts).length;

  // Era focus (by decade)
  const decadeCounts = {};

  collection.forEach((item) => {
    const year = item.comics?.release_year;
    if (!year) return;

    const decade = Math.floor(year / 10) * 10;
    decadeCounts[decade] =
      (decadeCounts[decade] || 0) + 1;
  });

  const dominantDecade =
    Object.entries(decadeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Slab %
  const slabCount = collection.filter(
    (c) => c.slab_company
  ).length;

  const slabPercent =
    totalBooks > 0
      ? Math.round((slabCount / totalBooks) * 100)
      : 0;

  return (
    <main style={{ padding: "2rem" }}>
      <div className="profile-hero-panel">
        <div className="profile-hero">
          <div className="profile-avatar">
            <img
              src="/default-hero-avatar.png"
              alt={`${username} avatar`}
            />
          </div>

          <div className="profile-info">
            <h1 className="profile-username">
              {username}
            </h1>

            <div className="profile-meta">
              Collector since 2026
            </div>

            <ShareProfileButton username={username} />
          </div>
        </div>
      </div>

      <h1>{username}&apos;s Collection</h1>

      <h2 className="profile-section-title">Collector Stats</h2>

      <div className="profile-stats">

        <div className="stat-card">
          <div className="stat-number">{totalBooks}</div>
          <div className="stat-label">Collection Size</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">{ownedCount}</div>
          <div className="stat-label">Owned</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">{wishlistCount}</div>
          <div className="stat-label">Wishlist</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">
            {topPublisher}
            <span className="stat-sub">
              ({topPublisherCount})
            </span>
          </div>
          <div className="stat-label">Dominant Publisher</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">
            {uniquePublishers}
          </div>
          <div className="stat-label">Publisher Diversity</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">
            {dominantDecade ? `${dominantDecade}s` : "N/A"}
          </div>
          <div className="stat-label">Era Focus</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">
            {slabPercent}%
          </div>
          <div className="stat-label">Slab Ratio</div>
        </div>

      </div>

      <div className="comic-grid">
        {collection.map((item) => {
          const comic = item.comics;
          if (!comic) return null;

          const primaryCover =
            comic.comic_covers?.find((c) => c.is_primary) ||
            comic.comic_covers?.[0];

          const coverUrl = primaryCover
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comic-covers/${primaryCover.image_path}`
            : "/fallback-cover.png";

          return (
            <Link
              key={item.id}
              href={`/comic/${comic.id}`}
              className="comic-card"
            >
              <div className="comic-card-cover">
                <img
                  src={coverUrl}
                  alt={comic.series_title}
                />
              </div>

              <div className="comic-card-title">
                {comic.series_title}
                {comic.issue_number
                  ? ` #${comic.issue_number}`
                  : ""}
              </div>

              <div className="comic-card-meta">
                {comic.release_year || "Unknown"}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}