import Link from "next/link";
import { notFound } from "next/navigation";
import ShareProfileButton from "@/components/ShareProfileButton";
import { headers } from "next/headers";
import Image from "next/image";
import EditProfileButton from "@/components/EditProfileButton";
import MessageButton from "@/components/MessageButton";
import ProfileTabs from "@/components/ProfileTabs";
import ProfileAnonCta from "@/components/ProfileAnonCta";
import CollectionStatsStrip from "@/components/CollectionStatsStrip";
import CollectionInsightSidebar from "@/components/CollectionInsightSidebar";
import RunCompletionWidget from "@/components/RunCompletionWidget";
import { createClient } from "@supabase/supabase-js";

function formatJoinDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function topShelfCoverUrl(d) {
  return d.canonicalCoverUrl || d.communityCoverUrl || d.personalCoverUrl || d.coverUrl || "/fallback-cover.png";
}

function formatAddedAgo(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "Added today";
  if (days === 1) return "Added yesterday";
  if (days < 30) return `Added ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Added ${months}mo ago`;
  return `Added ${Math.floor(months / 12)}y ago`;
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
  // Stats + insights are computed inside CollectionStatsStrip and
  // CollectionInsightSidebar from the raw `collection` array. We used to
  // do all that math inline here; Phase 2 unify centralizes it.

  // Workshop/showcase split (2026-08-27): collection value gets pulled out
  // of the shared stats strip into its own flex plaque here, and the
  // highest-value owned pieces get a dedicated "Top Shelf" row up front —
  // /library stays the data-dense management view, this page is the visual
  // one. `item.market_value` on the public-profile collection is already
  // server-resolved (auto or user-entered, whichever applies) — see
  // CollectionStatsStrip's rowValue() comment for why no autoMarketValues
  // map is needed here the way /library passes one.
  const showValue = visibility.value !== false;
  const ownedItems = collection.filter((item) => item.status === "owned");
  let collectionValue = 0;
  for (const item of ownedItems) {
    const v = Number(item.market_value);
    if (!Number.isNaN(v) && v > 0) collectionValue += v;
  }
  // Top Shelf isn't price-only — see key_issues table (migration 0026) and
  // CLAUDE.md's caveat that our current auto_market_value comes from eBay
  // *listing* prices, not confirmed sales. A curated key issue (1st
  // appearance, major death) belongs here even if the market hasn't caught
  // up to it yet, or comps just haven't landed. Ranking: any key issue
  // outranks any non-key issue regardless of price, mega-keys (tier 1)
  // outrank well-known keys (tier 2), and value breaks remaining ties.
  const topShelfScore = (item) => {
    const value = Number(item.market_value) || 0;
    if (item.key_issue) {
      const tierBonus = item.key_issue.tier === 1 ? 2_000_000 : 1_000_000;
      return tierBonus + value;
    }
    return value;
  };
  const topShelf = ownedItems
    .filter((item) => item.display && (item.key_issue || Number(item.market_value) > 0))
    .sort((a, b) => topShelfScore(b) - topShelfScore(a))
    .slice(0, 5);

  // Recently Added — "default to the last 5-10 books collected" on the
  // profile, distinct from Top Shelf (best pieces): the collection query
  // is already ordered by created_at DESC (see /api/public-profile), so
  // ownedItems already IS newest-first — no extra sort needed here. Overlap
  // with Top Shelf is fine and expected (a just-added grail should show up
  // in both); this section is about recency, not exclusivity.
  //
  // 6, not 8 — .profile-top-shelf-grid is `auto-fill, minmax(140px, 1fr)`
  // with no fixed column count, so at normal desktop widths it renders 7
  // columns. 8 items left a lonely single card stranded on its own second
  // row. 6 fits inside that first row with room to spare regardless of
  // count-per-row, so there's no orphan.
  const recentlyAdded = ownedItems.filter((item) => item.display).slice(0, 6);

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
              width={132}
              height={132}
              className="rounded-full"
              unoptimized={Boolean(profile.avatar_url)}
            />
          </div>

          <div className="profile-info">
            <div className="profile-username-row">
              <h1
                className="profile-username"
                style={{ fontFamily: "var(--font-display)" }}
              >
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

          {/* Collection value as a flex plaque INSIDE the hero row, not a
              separate strip below it — the mockup ("Workshop and The Case")
              composed the avatar, name, and value plaque as one hero
              moment, and splitting the plaque out into its own block below
              broke that composition, part of why the page read as
              underwhelming rather than a showcase. Suppressed from the
              shared stats strip further down via visibility.value=false so
              it isn't shown twice; still respects the owner's privacy
              toggle (showValue). */}
          {showValue && collectionValue > 0 && (
            <div className="profile-value-plaque">
              <div className="profile-value-plaque-label">Collection Value</div>
              <div
                className="profile-value-plaque-amount"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {formatCurrency(collectionValue)}
              </div>
              <div className="profile-value-plaque-meta">
                {ownedItems.length} book{ownedItems.length === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Top Shelf — highest-value owned pieces, pulled out front instead of
          waiting in the regular grid/rows tabs below. Empty when nothing has
          a market value yet (no comps, nothing user-priced) — no filler
          section rendered in that case. */}
      {topShelf.length > 0 && (
        <section className="profile-top-shelf">
          <div className="profile-top-shelf-header">
            <h2
              className="profile-top-shelf-title"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Top Shelf
            </h2>
            <span className="profile-top-shelf-sub">Highest-value pieces</span>
          </div>
          <div className="profile-top-shelf-grid">
            {topShelf.map((item) => {
              const d = item.display;
              return (
                <Link key={item.id} href={d.href} className="profile-top-shelf-card">
                  <div className="profile-top-shelf-cover">
                    <img src={topShelfCoverUrl(d)} alt={d.title} />
                    {item.key_issue ? (
                      <span className="profile-key-badge" title={item.key_issue.reason}>
                        KEY
                      </span>
                    ) : item.slab_company && item.grade_numeric ? (
                      <span className="profile-grade-badge">
                        {item.slab_company} {Number(item.grade_numeric).toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <div className="profile-top-shelf-title-line">
                    {d.title}
                    {d.issueNumber ? ` #${d.issueNumber}` : ""}
                  </div>
                  {/* A key issue with no price yet (no comps, nothing
                      user-priced) still needs a caption — "$0" would read as
                      broken. Show why it's here instead; once it does have a
                      real value, the price takes over as more useful info. */}
                  {Number(item.market_value) > 0 ? (
                    <div className="profile-top-shelf-value">
                      {formatCurrency(Number(item.market_value))}
                    </div>
                  ) : item.key_issue ? (
                    <div className="profile-recent-added-caption">{item.key_issue.reason}</div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Recently Added — the profile's other default view alongside Top
          Shelf: not "the best," just "the newest," so a collection with
          nothing valued yet (no comps, no user-priced items) still gets a
          showcase section instead of jumping straight to bare stats. */}
      {recentlyAdded.length > 0 && (
        <section className="profile-top-shelf">
          <div className="profile-top-shelf-header">
            <h2
              className="profile-top-shelf-title"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Recently Added
            </h2>
            <span className="profile-top-shelf-sub">Latest to the collection</span>
          </div>
          <div className="profile-top-shelf-grid">
            {recentlyAdded.map((item) => {
              const d = item.display;
              const addedLine = formatAddedAgo(item.created_at);
              return (
                <Link key={item.id} href={d.href} className="profile-top-shelf-card">
                  <div className="profile-top-shelf-cover">
                    <img src={topShelfCoverUrl(d)} alt={d.title} />
                    {item.slab_company && item.grade_numeric ? (
                      <span className="profile-grade-badge">
                        {item.slab_company} {Number(item.grade_numeric).toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                  <div className="profile-top-shelf-title-line">
                    {d.title}
                    {d.issueNumber ? ` #${d.issueNumber}` : ""}
                  </div>
                  {addedLine && (
                    <div className="profile-recent-added-caption">{addedLine}</div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* HEADLINE STATS STRIP — unified component (Phase 2 of unify). Same
          6-card strip used on /library so future stat changes don't drift.
          value is suppressed here — see the plaque above. */}
      <CollectionStatsStrip
        collection={collection}
        visibility={{ ...visibility, value: false }}
      />

      {/* Anon-visitor conversion banner. Client-gated via ProfileAnonCta
          because server-side `supabase.auth.getUser()` here can't read the
          auth cookie (createClient w/ ANON_KEY isn't cookie-aware), so the
          server-side `currentUser` is always null and the banner would
          render for signed-in viewers too. */}
      <ProfileAnonCta />

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
          {/* Owner-only: always reflects the signed-in viewer's own
              collection (server-derived from auth), never the profile
              being viewed, so this stays correct even when isOwner is true
              only because you're looking at your own page. */}
          {isOwner && <RunCompletionWidget />}

          {/* Unified sidebar widgets — same component used on /library. */}
          <CollectionInsightSidebar
            collection={collection}
            showCostBasis={isOwner}
          />

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
