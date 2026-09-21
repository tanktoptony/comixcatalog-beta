// Sitemap generation shared between the index (/sitemap.xml) and the
// per-chunk files (/sitemaps/<name>.xml).
//
// Why this is not src/app/sitemap.js any more: Next's sitemap.js convention
// can emit a flat urlset or split one via generateSitemaps(), but it cannot
// emit a <sitemapindex>, and it renames the entry point to /sitemap/0.xml.
// robots.txt and Search Console already point at /sitemap.xml, so that URL
// stays the entry point and becomes the index.
//
// Why series are chunked by UUID prefix rather than by offset: a deep
// .range(40000, 40999) over series with the allowlist filter took ~3s per
// page live (2026-09-21), and 46 of those in one request is not a route
// handler. Bounding each chunk by an id range uses the primary key, so each
// of the 16 chunks is ~2.9k rows in ~2s, generated independently and cached
// for a day. Issues (2.5M) are deliberately not enumerated yet.

import { supabaseServer } from "@/lib/supabase/server";
import { US_PUBLISHER_ALLOWLIST } from "@/lib/publisher";
import ARTICLES from "@/app/reads/articles";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";

export const SERIES_CHUNKS = "0123456789abcdef".split("");

// Same filter /api/search/series applies, so the sitemap enumerates exactly
// the series that search can surface. Nothing indexable that a visitor
// could not also find.
function allowlistedSeries(query) {
  return query
    .not("gcd_id", "is", null)
    .not("year_start_cached", "is", null)
    .in("resolved_publisher_cached", US_PUBLISHER_ALLOWLIST);
}

const STATIC_ROUTES = [
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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toIso(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export function urlsetXml(entries) {
  const body = entries
    .map(({ url, lastModified, changeFrequency, priority }) => {
      const parts = [`<loc>${escapeXml(url)}</loc>`];
      const iso = toIso(lastModified);
      if (iso) parts.push(`<lastmod>${iso}</lastmod>`);
      if (changeFrequency) parts.push(`<changefreq>${changeFrequency}</changefreq>`);
      if (priority != null) parts.push(`<priority>${priority}</priority>`);
      return `<url>${parts.join("")}</url>`;
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
}

export function sitemapIndexXml(names) {
  const body = names
    .map(
      (name) =>
        `<sitemap><loc>${escapeXml(`${SITE_URL}/sitemaps/${name}.xml`)}</loc></sitemap>`
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
  );
}

// Static routes plus every reading guide and published blog post.
export async function staticEntries() {
  const now = new Date();
  const entries = STATIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  for (const article of ARTICLES) {
    entries.push({
      url: `${SITE_URL}/reads/${article.slug}`,
      lastModified: article.updatedAt || article.publishedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  const { data, error } = await supabaseServer()
    .from("blog_posts")
    .select("slug, published_at, updated_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  for (const post of data ?? []) {
    if (!post.slug) continue;
    entries.push({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.updated_at || post.published_at,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  return entries;
}

// One hex prefix's worth of allowlisted series, walked by keyset on id.
// PostgREST caps reads at 1000 rows silently (see
// src/lib/supabase/fetchAllPages.js), so this pages explicitly. It cannot
// reuse fetchAllPages because that one is offset-based, which is exactly
// what is slow here.
export async function seriesEntries(prefix) {
  if (!SERIES_CHUNKS.includes(prefix)) return null;
  const supabase = supabaseServer();
  const lower = `${prefix}0000000-0000-0000-0000-000000000000`;
  const upper = `${prefix}fffffff-ffff-ffff-ffff-ffffffffffff`;
  const PAGE = 1000;
  const entries = [];
  let after = null;
  for (;;) {
    let query = allowlistedSeries(supabase.from("series").select("id"))
      .gte("id", lower)
      .lte("id", upper)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      entries.push({
        url: `${SITE_URL}/series/${row.id}`,
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
    if (!data || data.length < PAGE) break;
    after = data[data.length - 1].id;
  }
  return entries;
}
