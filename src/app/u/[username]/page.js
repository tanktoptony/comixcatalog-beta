import Link from "next/link";
import { notFound } from "next/navigation";
import ShareProfileButton from "@/components/ShareProfileButton";
import { headers } from "next/headers";
import Image from "next/image";
import EditAvatarButton from "@/components/EditAvatarButton";
import { createClient } from "@supabase/supabase-js";

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

  const data = await res.json();
  const { profile, collection } = data;

  // OWNER DETECTION
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const isOwner = currentUser?.id === profile.id;

  // STATS
  const totalBooks = collection.length;
  const ownedCount = collection.filter((c) => c.status === "owned").length;
  const wishlistCount = collection.filter((c) => c.status === "wishlist").length;

  const publisherCounts = {};
  collection.forEach((item) => {
    const publisher = item.comics?.publisher;
    if (!publisher) return;
    publisherCounts[publisher] =
      (publisherCounts[publisher] || 0) + 1;
  });

  const sortedPublishers = Object.entries(publisherCounts).sort(
    (a, b) => b[1] - a[1]
  );

  const topPublisher = sortedPublishers[0]?.[0] || "Unknown";
  const topPublisherCount = sortedPublishers[0]?.[1] || 0;
  const uniquePublishers = Object.keys(publisherCounts).length;

  const decadeCounts = {};
  collection.forEach((item) => {
    const year = item.comics?.release_year;
    if (!year) return;
    const decade = Math.floor(year / 10) * 10;
    decadeCounts[decade] =
      (decadeCounts[decade] || 0) + 1;
  });

  const dominantDecade =
    Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const slabCount = collection.filter((c) => c.slab_company).length;
  const slabPercent =
    totalBooks > 0
      ? Math.round((slabCount / totalBooks) * 100)
      : 0;

    return (
      <main style={{ padding: "2rem" }}>
        {/* HERO */}
        <div className="profile-hero-panel">
          <div className="profile-hero">
            <div className="profile-avatar">
              <Image
                src={`/avatars/${profile?.avatar_key || "cc_badge"}.png`}
                alt="avatar"
                width={120}
                height={120}
                className="rounded-full"
              />

              <EditAvatarButton
                profileId={profile.id}
                currentAvatar={profile.avatar_key}
              />
            </div>

            <div className="profile-info">
              <h1 className="profile-username">{username}</h1>
              <div className="profile-meta">Collector since 2026</div>
              <ShareProfileButton username={username} />
            </div>
          </div>
        </div>

        {/* STATS */}
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
              <span className="stat-sub"> ({topPublisherCount})</span>
            </div>
            <div className="stat-label">Dominant Publisher</div>
          </div>

          <div className="stat-card">
            <div className="stat-number">{uniquePublishers}</div>
            <div className="stat-label">Publisher Diversity</div>
          </div>

          <div className="stat-card">
            <div className="stat-number">
              {dominantDecade ? `${dominantDecade}s` : "N/A"}
            </div>
            <div className="stat-label">Era Focus</div>
          </div>

          <div className="stat-card">
            <div className="stat-number">{slabPercent}%</div>
            <div className="stat-label">Slab Ratio</div>
          </div>
        </div>

        {/* EMPTY STATE OR GRID */}
        {collection.length === 0 ? (
          <div className="profile-empty-state">
            <h2 className="profile-empty-title">
              Welcome to your collection.
            </h2>

            <p className="profile-empty-text">
              Here’s how to get started:
            </p>

            <div className="profile-empty-steps">
              <div>1️⃣ Search for a comic or Upload your own</div>
              <div>2️⃣ Add it to your collection (recommended!) or wishlist</div>
              <div>3️⃣ Upload a cover image</div>
              <div>4️⃣ Track condition, slabs, and notes</div>
              <div>5️⃣ Share your profile with other collectors</div>
            </div>
            <hr />

            <div className="profile-empty-actions">
              <Link href="/search" className="primary-btn">
                Browse Comics
              </Link>

              <Link href="/library" className="filter-btn">
                Upload your Comics
              </Link>
            </div>
          </div>
        ) : (
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
        )}
      </main>
);
}