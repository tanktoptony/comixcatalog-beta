import SearchPageClient from "./SearchPageClient";
import { getInitialSearch, SEARCH_PAGE_SIZE } from "@/lib/pageData";
import { getFeaturedSeries } from "@/lib/featuredSeriesData";

// Server-renders the first page of results (or, with no query, the featured
// browse list) into the HTML. This page used to be client-only
// (dynamic(..., { ssr: false })): it shipped an empty shell, waited for the
// JavaScript, then fetched results, so a phone on a slow connection stared
// at "Loading search…" for many seconds. Later pages, filters and live
// typing still run in SearchPageClient exactly as before.
export default async function SearchPage({ searchParams }) {
  const { q } = await searchParams;
  const query = (typeof q === "string" ? q : "").trim();

  let initialComics = null;
  let initialSeries = null;
  if (query) {
    ({ comics: initialComics, series: initialSeries } = await getInitialSearch(query));
  } else {
    try {
      const featured = await getFeaturedSeries();
      initialComics = featured.length ? featured.slice(0, SEARCH_PAGE_SIZE) : null;
    } catch (err) {
      console.error("search browse list failed:", err);
    }
  }

  return (
    <SearchPageClient
      initialQuery={query}
      initialComics={initialComics}
      initialSeries={initialSeries}
    />
  );
}
