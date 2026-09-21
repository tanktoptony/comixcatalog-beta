// /sitemaps/static.xml       static routes, reading guides, published blog posts
// /sitemaps/series-<hex>.xml allowlisted series whose id starts with <hex>
//
// Every file is generated at build time (generateStaticParams below) and
// then revalidated daily. Without the build step each chunk was rendered on
// its first request, and in production that first request ran the Supabase
// query inside a cold Vercel function: /sitemaps/series-3.xml returned 500
// on its first hit after the 2026-09-21 deploy. Google's first crawl is
// exactly that cold hit, so nothing may be generated on demand.

import {
  SERIES_CHUNKS,
  seriesEntries,
  staticEntries,
  urlsetXml,
} from "@/lib/sitemap";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 86400;

export function generateStaticParams() {
  return [
    { name: "static.xml" },
    ...SERIES_CHUNKS.map((c) => ({ name: `series-${c}.xml` })),
  ];
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
  }

  if (!entries) return new Response("Not found", { status: 404 });
  return new Response(urlsetXml(entries), { headers: XML });
}
