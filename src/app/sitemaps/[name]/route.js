// /sitemaps/static.xml       static routes, reading guides, published blog posts
// /sitemaps/series-<hex>.xml allowlisted series whose id starts with <hex>
//
// Each file is rendered on first request and cached for a day; a crawler
// refetching a chunk never triggers a live query inside that window.

import { seriesEntries, staticEntries, urlsetXml } from "@/lib/sitemap";

export const dynamic = "force-static";
export const revalidate = 86400;

const XML = { "Content-Type": "application/xml; charset=utf-8" };

export async function GET(_request, { params }) {
  const { name } = await params;
  const base = String(name ?? "").replace(/\.xml$/, "");

  let entries = null;
  if (base === "static") {
    entries = await staticEntries();
  } else if (base.startsWith("series-")) {
    entries = await seriesEntries(base.slice("series-".length));
  }

  if (!entries) return new Response("Not found", { status: 404 });
  return new Response(urlsetXml(entries), { headers: XML });
}
