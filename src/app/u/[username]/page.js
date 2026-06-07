import Link from "next/link";
import { notFound } from "next/navigation";
import ShareProfileButton from "@/components/ShareProfileButton";
import { headers } from "next/headers";
import Image from "next/image";
import EditProfileButton from "@/components/EditProfileButton";
import MessageButton from "@/components/MessageButton";
import ProfileTabs from "@/components/ProfileTabs";
import { createClient } from "@supabase/supabase-js";

function formatCurrency(n, opts = {}) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(n);
}

function formatJoinDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function PublicProfilePage({ params }) {
  const { username } = await params;
  if (!username) notFound();

  const headersList = await headers();
  const host = headersList.get("host");
  if (!host) throw new Error("Host header missing");

  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const viewerParam = currentUser?.id
    ? `&viewer_id=${encodeURIComponent(currentUser.id)}`
    : "";
  const res = await fetch(
    `${protocol}://${host}/api/public-profile?username=${username}${viewerParam}`,
    { cache: "no-store" }
  );
  if (!res.ok) notFound();

  const { profile, collection, visibility = {} } = await res.json();

  const isOwner = currentUser?.id === profile.id;

  const ownedItems = collection.filter((c) => c.status === "owned");
  const wantlistCount = collection.filter((c) => c.status === "wishlist").length;
  const forSaleCount = collection.filter((c) => c.status === "for_sale").length;
  const ownedCount = ownedItems.length;

  const totalMarketValue = ownedItems.reduce(
    (sum, c) => sum + (Number(c.market_value) || 0),
    0
  );
  const hasMarketValue = ownedItems.some(
    (c) => c.market_value != null && Number(c.market_value) > 0
  );

  const costBasis = ownedItems
    .filter((c) => c.purchase_price != null)
    .reduce((sum, c) => sum + Number(c.purchase_price), 0);
  const hasCostData = ownedItems.some((c) => c.purchase_price != null);

  const slabCount = collection.filter((c) => c.slab_company).length;
  const slabPercent = collection.length
    ? Math.round((slabCount / collection.length) * 100)
    : 0;

  // Unique series count — Phase 1 unify alignment with /library. Keyed on
  // normalized (title, publisher) so two volumes of the same title under
  // different publishers count as separate series (e.g. "Captain America"
  // Marvel vs "Captain America" Atlas reprint).
  const uniqueSeries = new Set(
    collection
      .map((item) => {
        const t = (item.display?.title || "").trim().toLowerCase();
        const p = (item.display?.publisher || "").trim().toLowerCase();
        return t ? `${t}::${p}` : null;
      })
      .filter(Boolean)
  ).size;

  const publisherCounts = {};
  collection.forEach((item) => {
    const p = item.display?.publisher;
    if (!p) return;
    publisherCounts[p] = (publisherCounts[p] || 0) + 1;
  });
  const sortedPublishers = Object.entries(publisherCounts).sort(
    (a, b) => b[1] - a[1]
  );
  const topPublishers = sortedPublishers.slice(0, 5);

  const decadeCounts = {};
  collection.forEach((item) => {
    const year = item.display?.year;
    if (!year) return;
    const decade = Math.floor(year / 10) * 10;
    decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
  });
  const dominantDecade =
    Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const joinDate = formatJoinDate(profile.created_at);
  const avatarSrc = profile.avatar_url
    ? profile.avatar_url
    : `/avatars/${profile?.avatar_key || "cc_badge"}.png`;

  return (
    <main className="profile-page">
      {/* HERO */}
      <section className="profile-hero-panel">
        <div className="profile-hero">
          <div className="profile-avatar">
            <Image
              src={avatarSrc}
              alt={`${username} avatar`}
              width={120}
              height={120}
              className="rounded-full"
              unoptimized={Boolean(profile.avatar_url)}
            />
          </div>

          <div className="profile-info">
            <div className="profile-username-row">
              <h1 className="profile-username">
                {profile.display_name || username}
              </h1>
              <div className="profile-badges">
                {profile?.is_founding_collector && (
                  <span className="profile-badge founding">
                    ★ Founding Collector
                  </span>
                )}
                {profile?.is_pro && (
                  <span className="profile-badge pro">PRO</span>
                )}
              </div>
            </div>
            {profile.display_name && (
              <div className="profile-handle">@{username}</div>
            )}
            <div className="profile-meta-row">
              {joinDate && (
                <span className="profile-meta">Collector since {joinDate}</span>
              )}
              {profile.location && (
                <span className="profile-meta">· {profile.location}</span>
              )}
              {profile.website_url && (
                <a
                  className="profile-website-link"
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener nofollow noreferrer"
                >
                  · {profile.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )}
            </div>
            {profile.bio && <p className="profile-bio">{profile.bio}</p>}
            <div className="profile-actions">
              <ShareProfileButton username={username} />
              {/* EditProfileButton self-gates on client-side ownership check */}
              <EditProfileButton profile={profile} />
              {/* MessageButton self-gates: hidden when viewing own profile or
                  not signed in. Renders as null otherwise. */}
              <MessageButton recipientUsername={username} recipientId={profile.id} />
              {isOwner && (
                <Link href="/library" className="profile-action-btn">
                  Manage library
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* HEADLINE STATS STRIP */}
      <section className="profile-headline-stats">
        <div className="profile-stat-pill">
          <div className="profile-stat-pill-num">{ownedCount}</div>
          <div className="profile-stat-pill-label">Owned</div>
        </div>
        <div className="profile-stat-pill">
          <div className="profile-stat-pill-num">{wantlistCount}</div>
          <div className="profile-stat-pill-label">Wantlist</div>
        </div>
        <div className="profile-stat-pill">
          <div className="profile-stat-pill-num">{forSaleCount}</div>
          <div className="profile-stat-pill-label">For Sale</div>
        </div>
        {hasMarketValue && visibility.value !== false && (
          <div className="profile-stat-pill highlight">
            <div className="profile-stat-pill-num">
              {formatCurrency(totalMarketValue)}
            </div>
            <div className="profile-stat-pill-label">Collection Value</div>
          </div>
        )}
        <div className="profile-stat-pill">
          <div className="profile-stat-pill-num">{slabCount}</div>
          <div className="profile-stat-pill-label">Slabbed</div>
        </div>
      </section>

      {/* BODY: tabs + sidebar */}
      <div className="profile-body">
        <div className="profile-body-main">
          <ProfileTabs
            collection={collection}
            isOwner={isOwner}
            visibility={visibility}
          />
        </div>

        <aside className="profile-sidebar">
          <div className="profile-side-card">
            <h3 className="profile-side-title">About this collector</h3>
            <dl className="profile-side-dl">
              {dominantDecade && (
                <>
                  <dt>Era focus</dt>
                  <dd>{dominantDecade}s</dd>
                </>
              )}
              <dt>Slab ratio</dt>
              <dd>{slabPercent}%</dd>
              {uniqueSeries > 0 && (
                <>
                  <dt>Unique series</dt>
                  <dd>{uniqueSeries}</dd>
                </>
              )}
              {isOwner && hasCostData && (
                <>
                  <dt>Cost basis</dt>
                  <dd>{formatCurrency(costBasis)}</dd>
                </>
              )}
            </dl>
          </div>

          {topPublishers.length > 0 && (
            <div className="profile-side-card">
              <h3 className="profile-side-title">Top publishers</h3>
              <ul className="profile-publisher-list">
                {topPublishers.map(([name, count]) => (
                  <li key={name} className="profile-publisher-row">
                    <span className="profile-publisher-name">{name}</span>
                    <span className="profile-publisher-count">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isOwner && collection.length === 0 && (
            <div className="profile-side-card">
              <h3 className="profile-side-title">Get started</h3>
              <ol className="profile-getstarted">
                <li>Search for a comic</li>
                <li>Add it to your collection or wantlist</li>
                <li>Track condition, slabs, and value</li>
                <li>Share your profile with collectors</li>
              </ol>
              <div className="profile-getstarted-actions">
                <Link href="/search" className="primary-btn">
                  Browse comics
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
