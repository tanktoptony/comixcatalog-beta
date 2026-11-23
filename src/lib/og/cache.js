// Gives a link-preview card its route's own refresh window.
//
// next/og's ImageResponse stamps every image "Cache-Control: public,
// max-age=0, must-revalidate". Next writes its ISR header (s-maxage from the
// route's `revalidate`) only when the response has none, and Vercel caches a
// path rendered on demand by that header. So every card was stale the moment
// it was cached and re-rendered on each hit (seen 2026-11-22: X-Vercel-Cache
// STALE with Age reset on every request). Deleting the stamp is not enough:
// the page data caches the cards read (unstable_cache, 60 s for profiles,
// 600 s for series) would shrink the window to theirs. Same header shape
// Next writes, with its one-year expiry.

const EXPIRE_SECONDS = 31536000;

export function cardCacheControl(seconds) {
  return `s-maxage=${seconds}, stale-while-revalidate=${EXPIRE_SECONDS - seconds}`;
}

// Wraps an opengraph-image default export: export default cachedCard(revalidate, Image).
export function cachedCard(seconds, render) {
  return async function CachedCard(props) {
    const response = await render(props);
    response.headers.set("cache-control", cardCacheControl(seconds));
    return response;
  };
}
