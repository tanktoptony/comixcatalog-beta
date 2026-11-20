import { unstable_cache } from "next/cache";
import { avatarForProfile } from "@/lib/defaultAvatar";
import { getFoundingShowcase } from "./foundingShowcase.js";
import { getServiceClient } from "./supabase/service.js";

// The Founding Collectors wall: every founder in the order they joined
// (their number on the wall), with name and avatar for public profiles and,
// when their collection is public too, one book from it for the tile.
// Private founders keep their slot and number but show no name. Cached a
// minute, same as the remaining-count read in foundingStatus.js.
export const getFoundingRoster = unstable_cache(
  async () => {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("profiles")
      .select("id, username, is_public, show_collection, avatar_key, avatar_url, created_at")
      .eq("is_founding_collector", true)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    const rows = data ?? [];
    const isVisible = (p) => p.is_public !== false && Boolean(p.username);
    const shelfIds = rows.filter((p) => isVisible(p) && p.show_collection !== false).map((p) => p.id);
    let showcase = {};
    try {
      showcase = shelfIds.length ? await getFoundingShowcase(shelfIds) : {};
    } catch (showcaseError) {
      console.error("founding showcase failed:", showcaseError?.message ?? showcaseError);
    }
    // Numbers count every founder (private ones included) so a name's
    // number never shifts when someone else changes their privacy setting.
    return rows.map((p, i) => {
      const visible = isVisible(p);
      const book = visible ? showcase[p.id] : null;
      return {
        number: i + 1,
        username: visible ? p.username : null,
        avatar: visible ? avatarForProfile(p) : null,
        cover: book?.cover ?? null,
        bookTitle: book?.title ?? null,
      };
    });
  },
  ["founding-roster-v4"],
  { revalidate: 60 }
);
