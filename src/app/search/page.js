import SearchPageClient from "./SearchPageClient";
import { getInitialSearch } from "@/lib/pageData";

// Server-renders the first page of query results into the HTML. This page used to be client-only
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
  }

  return (
    <SearchPageClient
      initialQuery={query}
      initialComics={initialComics}
      initialSeries={initialSeries}
    />
  );
}
