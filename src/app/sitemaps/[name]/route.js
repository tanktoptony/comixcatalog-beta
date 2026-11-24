// /sitemaps/static.xml       static routes, reading guides, published blog posts
// /sitemaps/series-<hex>.xml allowlisted series whose id starts with <hex>
// /sitemaps/creators-<part>.xml creators split by the first slug character
// /sitemaps/issues-<n>.xml   issue pages worth listing, from the nightly table
//
// Rendered on first request and cached for a day (ISR), NOT at build time.
// History: on 2026-09-21 a cold first request 500'd, so every file moved to
// build time. Then on 2026-10-01 the database was slow during deploys and
// the 16 series queries failed the build itself, which blocked every deploy
// for hours. Now a failure can only cost one request: Next never caches a
// thrown render, keeps serving the last good copy, and tries again. The
// warm-sitemaps workflow requests the files right after each production
// deploy (with retries), so Google's first crawl hits a warm cache.

import {
  creatorEntries,
  seriesEntries,
  staticEntries,
  urlsetXml,
} from "@/lib/sitemap";
import { issueEntries } from "@/lib/sitemapIssues";

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 86400;

// Nothing at build time; see above.
export function generateStaticParams() {
  return [];
}

const XML = { "Content-Type": "application/xml; charset=utf-8" };

export async function GET(_request, { params }) {
  const { name } = await params;
  const base = String(name ?? "").replace(/\.xml$/, "");

  let entries = null;
  if (base === "static") {
    entries = await staticEntries();
  } else if (base.startsWith("series-")) {
    entries = await seriesEntries(base.slice("series-".length));
  } else if (base.startsWith("creators-")) {
    entries = await creatorEntries(base.slice("creators-".length));
  } else if (base.startsWith("issues-")) {
    entries = await issueEntries(base);
  }

  if (!entries) return new Response("Not found", { status: 404 });
  return new Response(urlsetXml(entries), { headers: XML });
}
