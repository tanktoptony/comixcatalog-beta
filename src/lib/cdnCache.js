// Cache-Control values for public, viewer-independent API responses, so
// Vercel's CDN answers repeat requests instead of re-running the route (and
// its Supabase queries) on every page view. s-maxage applies only to the CDN;
// browsers still revalidate. Only attach these to successful responses: an
// error or degraded-empty body must not be served from cache for an hour.
//
// Never use these on a route that reads the viewer (Authorization header,
// cookies) or returns anything user-specific.

// Search results and series pages: new covers arrive hourly, so a few
// minutes of staleness is invisible.
export const CDN_CACHE_SHORT = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" };

// The homepage featured carousel: the list rotates weekly.
export const CDN_CACHE_LONG = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };
