// Tells crawlers what they can index. Next App Router auto-routes this to
// /robots.txt at build time.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Block private routes and API endpoints from indexing.
        disallow: [
          "/api/",
          "/account",
          "/login",
          "/signup",
          "/auth/",
          "/library",
          "/contribute/add-comic",
          "/blog/create",
          "/logout",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
