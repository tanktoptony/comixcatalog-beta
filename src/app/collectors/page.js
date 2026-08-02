import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function CollectorsPage() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const [profilesResult, countResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, avatar_key, is_founding_collector")
        .eq("is_public", true)
        .not("username", "is", null)
        .order("username", { ascending: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_founding_collector", true),
    ]);

    const { data, error } = profilesResult;
    const spotsRemaining = Math.max(0, 100 - (countResult.count ?? 0));

    if (error) {
      console.error("CollectorsPage profiles error:", error);
      return <main style={{ padding: "2rem" }}>Error loading collectors.</main>;
    }

    const profiles = Array.isArray(data)
      ? data.filter((profile) => profile?.id && profile?.username)
      : [];

    return (
      <main style={{ padding: "2rem" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 className="profile-section-title">Founding Collectors</h1>
          <p style={{ marginTop: "0.5rem", color: "var(--x-gold)", fontWeight: 700, fontSize: "1rem" }}>
            {spotsRemaining > 0
              ? `${spotsRemaining} free lifetime Pro passes remaining`
              : "All founding collector spots have been claimed."}
          </p>
          <p style={{ marginTop: "0.25rem", color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>
            Create an account, catalog 10 comics, and claim an available pass—no card required.
          </p>
        </div>

        {profiles.length === 0 ? (
          <div style={{ marginTop: "1rem" }}>No public collectors yet.</div>
        ) : (
          <div className="collectors-grid">
            {profiles.map((profile) => {
              const avatarKey = profile.avatar_key || "hero_01";

              return (
                <Link
                  key={profile.id}
                  href={`/u/${profile.username}`}
                  className="collector-card"
                >
                  <img
                    src={`/avatars/${avatarKey}.png`}
                    alt={`${profile.username} avatar`}
                    width={80}
                    height={80}
                    className="rounded-full"
                    style={{ objectFit: "cover" }}
                    loading="lazy"
                  />

                  <div className="collector-name">{profile.username}</div>
                  {profile.is_founding_collector && (
                    <div className="founding-badge">★ Founding Collector</div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    );
  } catch (err) {
    console.error("CollectorsPage crashed:", err);
    return <main style={{ padding: "2rem" }}>Error loading collectors.</main>;
  }
}
