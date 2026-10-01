import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

// The Founding Collectors "Roll of Honor": founders with public profiles,
// in the order they joined (their number on the wall). Cached a minute,
// same as the remaining-count read in foundingStatus.js.
export const getFoundingRoster = unstable_cache(
  async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await sb
      .from("profiles")
      .select("username, is_public, created_at")
      .eq("is_founding_collector", true)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    // Numbers count every founder (private ones included) so a name's
    // number never shifts when someone else changes their privacy setting.
    return (data ?? [])
      .map((p, i) => ({ number: i + 1, username: p.is_public !== false ? p.username : null }))
      .filter((p) => p.username);
  },
  ["founding-roster-v1"],
  { revalidate: 60 }
);
