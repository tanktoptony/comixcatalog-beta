import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Jewel-tone gradients for the initials fallback — richer than a flat hero-icon
// set but still moody/premium rather than cartoony.
const AVATAR_TONES = [
  "linear-gradient(135deg, #2b3a8f, #171e4a)",
  "linear-gradient(135deg, #0f766e, #0a2e2b)",
  "linear-gradient(135deg, #7c2d4a, #3a1523)",
  "linear-gradient(135deg, #a5760f, #3f2e08)",
  "linear-gradient(135deg, #2563a8, #10233f)",
  "linear-gradient(135deg, #1f6b4a, #0b2b1d)",
];

function avatarTone(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export default async function CollectorsPage() {
  let profiles = [];
  let spotsRemaining = 0;
  let loadError = false;

  // Data-fetching only — JSX is constructed after this block returns, never
  // inside it, since React doesn't render synchronously and a try/catch
  // wrapped around JSX can't actually catch rendering errors anyway.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const [profilesResult, countResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, avatar_url, is_founding_collector")
        .eq("is_public", true)
        .not("username", "is", null)
        .order("username", { ascending: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true }),
    ]);

    const { data, error } = profilesResult;

    if (error) {
      console.error("CollectorsPage profiles error:", error);
      loadError = true;
    } else {
      profiles = Array.isArray(data)
        ? data.filter((profile) => profile?.id && profile?.username)
        : [];
      spotsRemaining = Math.max(0, 100 - (countResult.count ?? 0));
    }
  } catch (err) {
    console.error("CollectorsPage crashed:", err);
    loadError = true;
  }

  if (loadError) {
    return <main style={{ padding: "2rem" }}>Error loading collectors.</main>;
  }

  return (
    <main style={{ padding: "2rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className="profile-section-title">Founding Collectors</h1>
        <p style={{ marginTop: "0.5rem", color: "var(--x-gold)", fontWeight: 700, fontSize: "1rem" }}>
          {spotsRemaining > 0
            ? `${spotsRemaining} free lifetime Pro memberships remaining`
            : "All founding collector spots have been claimed."}
        </p>
        <p style={{ marginTop: "0.25rem", color: "rgba(255,255,255,0.5)", fontSize: "0.85rem" }}>
          Join while spots remain and lifetime Pro is added automatically—no card required.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div style={{ marginTop: "1rem" }}>No public collectors yet.</div>
      ) : (
        <div className="collectors-grid">
          {profiles.map((profile) => {
            return (
              <Link
                key={profile.id}
                href={`/u/${profile.username}`}
                className="collector-card"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={`${profile.username} avatar`}
                    width={64}
                    height={64}
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="collector-avatar-fallback"
                    style={{ background: avatarTone(profile.username) }}
                    aria-hidden="true"
                  >
                    {profile.username.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="collector-name">{profile.username}</div>
                {profile.is_founding_collector && (
                  <div className="founding-badge">Founding Collector</div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
