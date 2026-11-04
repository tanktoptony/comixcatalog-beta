// /sitemap.xml is a sitemap index. The actual URL lists live under
// /sitemaps/<name>.xml so each can be generated and cached on its own.
// See src/lib/sitemap.js for why.

import { CREATOR_CHUNKS, SERIES_CHUNKS, sitemapIndexXml } from "@/lib/sitemap";
import { issueSitemapFiles } from "@/lib/sitemapIssues";

export const dynamic = "force-static";
// Hourly, not daily like the files: this also renders at build time, and a
// database hiccup then leaves the issue files out of the index until the next
// render. An unchanged render costs no cache write.
export const revalidate = 3600;

export async function GET() {
  const names = ["static", ...SERIES_CHUNKS.map((c) => `series-${c}`), ...CREATOR_CHUNKS.map((c) => `creators-${c}`)];
  // A failed read must not cost search engines the series and creator files.
  const issueFiles = await issueSitemapFiles().catch((error) => {
    console.error("sitemap index: could not read the issue files", error);
    return [];
  });
  return new Response(sitemapIndexXml([...names, ...issueFiles]), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
