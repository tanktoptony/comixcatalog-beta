import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function CollectorsPage() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_key")
      .eq("is_public", true)
      .not("username", "is", null)
      .order("username", { ascending: true });

    if (error) {
      console.error("CollectorsPage profiles error:", error);
      return <main style={{ padding: "2rem" }}>Error loading collectors.</main>;
    }

    const profiles = Array.isArray(data)
      ? data.filter((profile) => profile?.id && profile?.username)
      : [];

    return (
      <main style={{ padding: "2rem" }}>
        <h1 className="profile-section-title">Founding Collectors</h1>

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