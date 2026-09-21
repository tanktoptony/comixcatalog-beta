// /sitemap.xml is a sitemap index. The actual URL lists live under
// /sitemaps/<name>.xml so each can be generated and cached on its own.
// See src/lib/sitemap.js for why.

import { SERIES_CHUNKS, sitemapIndexXml } from "@/lib/sitemap";

export const dynamic = "force-static";
export const revalidate = 86400;

export function GET() {
  const names = ["static", ...SERIES_CHUNKS.map((c) => `series-${c}`)];
  return new Response(sitemapIndexXml(names), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
