// Tells crawlers what they can index. Next App Router auto-routes this to
// /robots.txt at build time.

import { SITE_URL } from "@/lib/siteUrl";

// Crawlers that take without sending anyone back: AI-training scrapers and
// SEO-tool bots. Every series page they render costs two database reads
// (gcd_issues + canonical_covers), and on 2026-10-05 the database nearly ran
// out of its disk I/O budget with about 27 accounts, so the reads were bots,
// not members. Search engines and the AI *search* assistants that cite and
// link pages (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User,
// Perplexity-User) stay allowed on purpose: they are discovery.
//
// 2026-11-01: PerplexityBot moved to the blocked list. From 10-19 it and the
// AI index crawlers below were ~85% of all requests (10,000 in 32 minutes,
// nearly every one an uncached issue/creator/series render), roughly $70/month
// of Vercel CPU, with no signup or referral traced back to any of them.
const BLOCKED_BOTS = [
  "PerplexityBot",
  "AionBot",
  "Reflectionbot",
  "ExaSearchBot",
  "Amzn-SearchBot",
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
        allow: ["/", "/join/"],
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
