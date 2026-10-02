import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// The Founding Collectors wall: every founder in the order they joined
// (their number on the wall), with name and avatar for public profiles.
// Private founders keep their slot and number but show no name. Cached a
// minute, same as the remaining-count read in foundingStatus.js.
export const getFoundingRoster = unstable_cache(
  async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await sb
      .from("profiles")
      .select("username, is_public, avatar_key, avatar_url, created_at")
      .eq("is_founding_collector", true)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    // Numbers count every founder (private ones included) so a name's
    // number never shifts when someone else changes their privacy setting.
    return (data ?? []).map((p, i) => {
      const visible = p.is_public !== false && Boolean(p.username);
      return {
        number: i + 1,
        username: visible ? p.username : null,
        avatar: visible ? p.avatar_url || `/avatars/${p.avatar_key || "cc_badge"}.png` : null,
      };
    });
  },
  ["founding-roster-v2"],
  { revalidate: 60 }
);
