import Link from "next/link";
import { notFound } from "next/navigation";
import ShareProfileButton from "@/components/ShareProfileButton";
import { headers } from "next/headers";
import Image from "next/image";
import EditProfileButton from "@/components/EditProfileButton";
import MessageButton from "@/components/MessageButton";
import ProfileTabs from "@/components/ProfileTabs";
import CollectionStatsStrip from "@/components/CollectionStatsStrip";
import CollectionInsightSidebar from "@/components/CollectionInsightSidebar";
import { createClient } from "@supabase/supabase-js";

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
  // Stats + insights are computed inside CollectionStatsStrip and
  // CollectionInsightSidebar from the raw `collection` array. We used to
  // do all that math inline here; Phase 2 unify centralizes it.

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

      {/* HEADLINE STATS STRIP — unified component (Phase 2 of unify). Same
          6-card strip used on /library so future stat changes don't drift. */}
      <CollectionStatsStrip collection={collection} visibility={visibility} />

      {/* Anon-visitor conversion banner: paid posts will deep-link to public
          profiles, so the anon-visitor exit path matters. Owners + signed-in
          viewers don't see this. */}
      {!currentUser && (
        <section className="profile-anon-cta">
          <div className="profile-anon-cta-inner">
            <div>
              <strong>Track your own collection.</strong>{" "}
              Free to start &mdash; catalog every issue, grade, and value in one place.
            </div>
            <Link href="/signup" className="profile-anon-cta-btn">
              Start free →
            </Link>
          </div>
        </section>
      )}

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
