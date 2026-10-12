import { unstable_cache } from "next/cache";
import { avatarForProfile } from "@/lib/defaultAvatar";
import { getServiceClient } from "./supabase/service.js";

// The Founding Collectors wall: every founder in the order they joined
// (their number on the wall), with name and avatar for public profiles.
// Private founders keep their slot and number but show no name. Cached a
// minute, same as the remaining-count read in foundingStatus.js.
function initialOf(name) {
  const ch = String(name ?? "").replace(/^[^\p{L}\p{N}]+/u, "").charAt(0);
  return ch ? ch.toUpperCase() : null;
}

export const getFoundingRoster = unstable_cache(
  async () => {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, display_name, is_public, avatar_key, avatar_url, created_at")
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
        avatar: visible ? avatarForProfile(p) : null,
        defaultAvatar: false,
        initial: visible ? initialOf(p.display_name || p.username) : null,
      };
    });
  },
  ["founding-roster-v3"],
  { revalidate: 60 }
);
