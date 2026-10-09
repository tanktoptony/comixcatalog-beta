import { unstable_cache } from "next/cache";
import { GET as searchComicsGET } from "@/app/api/search/comics/route";
import { GET as searchSeriesGET } from "@/app/api/search/series/route";
import { GET as seriesGET } from "@/app/api/series/[id]/route";
import { GET as issueGET } from "@/app/api/issues/[id]/route";
import { GET as publicProfileGET } from "@/app/api/public-profile/route";

// Server-side reads for pages that used to render empty and fetch their
// data from the browser (/search, /series/[id]). The page renders with this
// data already in the HTML, so results are on screen before any JavaScript
// runs; the client components take it as initial state and skip their
// first fetch.
//
// Each loader calls the existing API route handler in-process rather than
// re-implementing it, so the server-rendered first page and every later
// client fetch can never disagree (same pattern as lookupIssue in
// src/lib/productionAssetsServer.js). Results go through Next's data cache,
// shared by every request and region.
//
// The search routes answer an internal error with 200 and an empty list, so
// an empty result is treated as "unknown": it is not cached and the page
// falls back to its client fetch. A real no-results search just costs that
// one extra request.

class EmptyResult extends Error {}
class IssueNotFoundError extends Error {}

async function callRoute(handler, url, key, context) {
  const res = await handler(new Request(url), context);
  if (res.status === 404) throw new IssueNotFoundError(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const body = await res.json();
  const value = body?.[key];
  if (value == null || (Array.isArray(value) && value.length === 0)) throw new EmptyResult();
  return value;
}

// Must match the first-page request SearchPageClient makes.
export const SEARCH_PAGE_SIZE = 36;

const cachedSearchComics = unstable_cache(
  (q) =>
    callRoute(
      searchComicsGET,
      `http://internal/api/search/comics?q=${encodeURIComponent(q)}&limit=${SEARCH_PAGE_SIZE}&offset=0`,
      "comics"
    ),
  ["page-search-comics-v1"],
  { revalidate: 600 }
);

const cachedSearchSeries = unstable_cache(
  (q) => callRoute(searchSeriesGET, `http://internal/api/search/series?q=${encodeURIComponent(q)}&limit=4`, "series"),
  ["page-search-series-v1"],
  { revalidate: 600 }
);

const settle = (p) =>
  p.then(
    (value) => value,
    (err) => {
      if (!(err instanceof EmptyResult)) console.error("pageData:", err);
      return null;
    }
  );

// { comics, series }; either may be null, meaning "let the client fetch it".
export async function getInitialSearch(q) {
  const [comics, series] = await Promise.all([settle(cachedSearchComics(q)), settle(cachedSearchSeries(q))]);
  return { comics, series };
}

const cachedSeries = unstable_cache(
  (id) =>
    callRoute(seriesGET, `http://internal/api/series/${encodeURIComponent(id)}`, "series", {
      params: Promise.resolve({ id }),
    }),
  ["page-series-v1"],
  { revalidate: 600 }
);

// The series payload /api/series/[id] returns, or null (not found, or an
// error the client fetch can retry).
export function getSeriesData(id) {
  return settle(cachedSeries(id));
}

const cachedIssue = unstable_cache(
  (id) =>
    callRoute(issueGET, `http://internal/api/issues/${encodeURIComponent(id)}`, "issue", {
      params: Promise.resolve({ id }),
    }),
  ["page-issue-v1"],
  { revalidate: 3600 }
);

// Anonymous public issue data. The browser still refreshes this with the
// viewer's session after hydration for ownership-specific fields.
export function getIssueData(id) {
  return cachedIssue(id).catch((error) => {
    if (error instanceof IssueNotFoundError) throw error;
    if (!(error instanceof EmptyResult)) console.error("pageData:", error);
    return null;
  });
}

export function isIssueNotFoundError(error) {
  return error instanceof IssueNotFoundError;
}

// The public profile (/u/[username]) for anonymous viewers. The page used to
// fetch our own /api/public-profile over HTTP (an extra serverless hop on
// every view); this calls the handler in-process and caches the result for
// a minute. A missing or private profile caches as { notFound: true }.
const cachedPublicProfile = unstable_cache(
  async (username) => {
    const res = await publicProfileGET(
      new Request(`http://internal/api/public-profile?username=${encodeURIComponent(username)}`)
    );
    if (res.status === 400 || res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`public-profile returned ${res.status}`);
    return res.json();
  },
  ["page-public-profile-v1"],
  { revalidate: 60 }
);

export function getPublicProfile(username) {
  return cachedPublicProfile(username);
}
