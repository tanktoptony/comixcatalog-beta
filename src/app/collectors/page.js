import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function CollectorsPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_key")
    .eq("is_public", true)
    .not("username", "is", null)
    .order("username", { ascending: true });

  if (error) {
    return <div style={{ padding: 32 }}>Error loading collectors.</div>;
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1 className="profile-section-title">
        Founding Collectors
      </h1>

      <div className="collectors-grid">
        {profiles?.map((profile) => (
          <Link
            key={profile.id}
            href={`/u/${profile.username}`}
            className="collector-card"
          >
            <Image
              src={`/avatars/${profile.avatar_key || "cc_badge"}.png`}
              alt="avatar"
              width={80}
              height={80}
              className="rounded-full"
            />

            <div className="collector-name">
              {profile.username}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}