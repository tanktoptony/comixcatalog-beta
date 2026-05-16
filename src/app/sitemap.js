// Tells search engines which URLs to index and how often they update.
// Next App Router auto-routes this to /sitemap.xml at build time.
//
// We deliberately do NOT enumerate every series/issue/comic here — there are
// 217k+ series and millions of issues. Listing them in a sitemap would create
// a 50MB+ file (Google's per-sitemap limit) and would index thin pages that
// don't yet have good content. Static + curated only for now. When per-series
// pages get rich content (price history, reviews), we add a sitemap index
// that splits across multiple sub-sitemaps.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";

export default function sitemap() {
  const now = new Date();

  const routes = [
    // Marketing / top-level
    { path: "", changeFrequency: "weekly", priority: 1.0 },
    { path: "/about", changeFrequency: "monthly", priority: 0.8 },
    { path: "/get-started", changeFrequency: "monthly", priority: 0.8 },
    { path: "/marketplace", changeFrequency: "weekly", priority: 0.9 },
    { path: "/search", changeFrequency: "weekly", priority: 0.9 },
    { path: "/founding-collectors", changeFrequency: "monthly", priority: 0.8 },
    { path: "/collectors", changeFrequency: "weekly", priority: 0.7 },
    { path: "/upgrade", changeFrequency: "monthly", priority: 0.7 },
    // Content
    { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
    { path: "/reads", changeFrequency: "weekly", priority: 0.6 },
    { path: "/forum", changeFrequency: "daily", priority: 0.6 },
    { path: "/community/guidelines", changeFrequency: "monthly", priority: 0.4 },
    // Help / trust
    { path: "/help", changeFrequency: "monthly", priority: 0.5 },
    { path: "/status", changeFrequency: "weekly", priority: 0.4 },
    { path: "/trust", changeFrequency: "monthly", priority: 0.5 },
    { path: "/sell", changeFrequency: "monthly", priority: 0.5 },
    { path: "/contribute/guidelines", changeFrequency: "monthly", priority: 0.4 },
    // Legal
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  ];

  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
