import { unstable_cache } from "next/cache";
import { getServiceClient } from "./supabase/service.js";
import { PUBLISHER_BY_SLUG } from "./publisherPages.js";

// Data for /publisher/[slug]: US-market series of one publisher. Cached for a
// day (series counts and covers move slowly); a failed read throws so an
// error is never cached as an empty page.
const COLUMNS = "id, title, year_start_cached, year_end_cached, issue_count_cached, featured_cover_path_cached";

function toRun(row) {
  return {
    id: row.id,
    title: row.title,
    year_start: row.year_start_cached,
    year_end: row.year_end_cached,
    issue_count: row.issue_count_cached ?? 0,
    cover: row.featured_cover_path_cached
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${row.featured_cover_path_cached}`
      : null,
  };
}

async function loadPublisher(slug) {
  const name = PUBLISHER_BY_SLUG.get(slug);
  if (!name) return null;
  const sb = getServiceClient();
  const base = () => sb.from("series").select(COLUMNS).eq("us_market", true).eq("resolved_publisher_cached", name);
  const thisYear = new Date().getUTCFullYear();
  const [count, biggest, newest, earliest] = await Promise.all([
    sb.from("series").select("id", { count: "exact", head: true }).eq("us_market", true).eq("resolved_publisher_cached", name),
    base().not("featured_cover_path_cached", "is", null).order("issue_count_cached", { ascending: false, nullsFirst: false }).limit(24),
    base().not("featured_cover_path_cached", "is", null).gte("year_start_cached", thisYear - 1).order("year_start_cached", { ascending: false }).order("issue_count_cached", { ascending: false, nullsFirst: false }).limit(12),
    base().not("year_start_cached", "is", null).order("year_start_cached", { ascending: true }).limit(1),
  ]);
  for (const result of [count, biggest, newest, earliest]) if (result.error) throw result.error;
  return {
    slug,
    name,
    series_count: count.count ?? 0,
    since: earliest.data?.[0]?.year_start_cached ?? null,
    biggest: (biggest.data ?? []).map(toRun),
    newest: (newest.data ?? []).map(toRun),
  };
}

export const getPublisherPage = unstable_cache(loadPublisher, ["publisher-page-v1"], { revalidate: 86400 });
