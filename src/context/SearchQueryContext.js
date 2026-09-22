"use client";

// One search query, shared between the header's input and /search's results.
//
// /search used to carry its own plain <input> underneath the header's, so the
// page had two live search boxes stacked on top of each other. The header's
// is the one people actually use, but only the page's filtered results as you
// typed — the header's just navigated on Enter. Deleting the page's input on
// its own would have traded a duplicate for a downgrade.
//
// So the header's input becomes the page's input while you're on /search:
// what you type lands here, SearchPageClient reads it and re-filters live,
// and the header's dropdown stays shut because the results are already on
// screen below it.
//
// Why a context and not useSearchParams() in the header: the header renders
// inside the root layout, so it wraps every route. useSearchParams() there
// would require a Suspense boundary around the whole app and opt every
// statically prerendered page into client rendering. /search already reads
// the URL (it sits behind its own Suspense boundary in page.js), so it seeds
// this context instead and the header never has to touch searchParams.

import { createContext, useContext, useMemo, useState } from "react";

const SearchQueryContext = createContext(null);

export function SearchQueryProvider({ children }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchQueryContext.Provider value={value}>{children}</SearchQueryContext.Provider>;
}

// Returns a stable no-op shape when used outside the provider so a component
// rendered in isolation (a test, a story) doesn't crash on a null context.
const FALLBACK = { query: "", setQuery: () => {} };

export function useSearchQuery() {
  return useContext(SearchQueryContext) ?? FALLBACK;
}
