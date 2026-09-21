// The one place the site's public origin is defined. Production redirects
// comixcatalog.com -> www.comixcatalog.com (307), so every absolute URL the
// app emits (canonicals, sitemap, robots, OpenGraph) must use www or Google
// sees a redirect on every page. NEXT_PUBLIC_SITE_URL is NOT set on Vercel
// (checked 2026-09-21), so this default is what production actually uses.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.comixcatalog.com"
).replace(/\/+$/, "");
