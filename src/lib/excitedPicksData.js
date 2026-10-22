import { unstable_cache } from "next/cache";
import { coverThumb } from "./coverThumb.js";
import {
  excitedSeriesGcdIds,
  resolveExcitedPicks,
} from "./excitedPicks.js";
import { getServiceClient } from "./supabase/service.js";

async function computeExcitedPicks() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("series")
      .select("id, gcd_id, title, year_start_cached, featured_cover_path_cached")
      .in("gcd_id", excitedSeriesGcdIds());

    if (error) throw error;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const seriesByGcdId = new Map(
      (data ?? []).map((row) => {
        const original = row.featured_cover_path_cached
          ? `${supabaseUrl}/storage/v1/object/public/canonical-covers/${row.featured_cover_path_cached}`
          : null;
        return [
          row.gcd_id,
          {
            id: row.id,
            gcdId: row.gcd_id,
            title: row.title,
            yearStart: row.year_start_cached,
            cover: original ? coverThumb(original) : null,
          },
        ];
      })
    );

    return resolveExcitedPicks(seriesByGcdId);
  } catch (err) {
    console.error("home excited picks failed:", err);
    return [];
  }
}

const cachedExcitedPicks = unstable_cache(
  computeExcitedPicks,
  ["home-excited-v1"],
  { revalidate: 3600 }
);

export function getExcitedPicks() {
  return cachedExcitedPicks();
}
