import { getFounderPassCovers } from "@/lib/foundingShowcase";
import { fillMosaic } from "@/lib/foundingShowcasePick";
import { coverThumb } from "./loadCollection.js";

// Server-only loader for the Founding Collector post image (1080x1350).
// Takes a service-role client and a VERIFIED user id (from getAuthedUser),
// so the image can only ever be the caller's own pass.
//
// The covers are the founder's own books, most valuable first, the same
// ones behind the number on their pass at /founding-collectors. Six at most
// are downloaded (as JPEG data URIs, which Satori can draw) and repeated to
// fill the mosaic. No covers means the card is drawn on plain navy.

const MOSAIC_CELLS = 9;
const MAX_FETCH = 6;

export async function loadFoundingCard(supabase, userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("username, is_founding_collector, created_at")
    .eq("id", userId)
    .single();
  if (error || !profile) throw new Error("profile not found");
  if (!profile.is_founding_collector) return { isFounder: false };

  // Same numbering as /api/founding/status and the wall: join order among
  // founders.
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_founding_collector", true)
    .lt("created_at", profile.created_at);
  if (countError) throw countError;

  let images = [];
  try {
    const own = (await getFounderPassCovers(userId)).slice(0, MAX_FETCH);
    images = (await Promise.all(own.map((cover) => coverThumb(cover.path)))).filter(Boolean);
  } catch (coverError) {
    // Decoration only; the pass still renders on navy.
    console.error("founding card covers failed", coverError?.message ?? coverError);
  }

  return {
    isFounder: true,
    number: (Number(count) || 0) + 1,
    username: profile.username,
    covers: fillMosaic(images, [], MOSAIC_CELLS),
  };
}
