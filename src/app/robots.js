// Tells crawlers what they can index. Next App Router auto-routes this to
// /robots.txt at build time.

import { SITE_URL } from "@/lib/siteUrl";

// Crawlers that take without sending anyone back: AI-training scrapers and
// SEO-tool bots. Every series page they render costs two database reads
// (gcd_issues + canonical_covers), and on 2026-10-05 the database nearly ran
// out of its disk I/O budget with about 27 accounts, so the reads were bots,
// not members. Search engines and the AI *search* assistants that cite and
// link pages (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot,
// Claude-User) stay allowed on purpose: they are discovery.
const BLOCKED_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Bytespider",
  "meta-externalagent",
  "Applebot-Extended",
  "Amazonbot",
  "cohere-ai",
  "Diffbot",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "PetalBot",
];

export default function robots() {
  return {
    rules: [
      { userAgent: BLOCKED_BOTS, disallow: "/" },
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
