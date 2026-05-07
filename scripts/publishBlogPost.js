// One-shot publisher for the May 2026 build update post. Uses the
// service-role key (bypasses RLS) and inserts directly into blog_posts.
//
// Usage:
//   node scripts/publishBlogPost.js
//
// Re-runnable: if a post with the same slug exists, the insert will fail
// with a unique-constraint error (slug should be UNIQUE in the table). In
// that case either delete the existing row in Supabase or change the slug.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const POST = {
  title: "What's new — May 2026 build update",
  slug: "may-2026-build-update",
  excerpt:
    "Profile customization, a redesigned navbar, faster cover ingestion, and 35,000+ scans archived. Here's what landed in the last few weeks — and what's next.",
  content: `A lot landed in the last few weeks. The site moves fast right now, and the easiest way to keep up is here.

## What's new

**Profile customization.** Your collector profile now supports a custom avatar (drag-and-drop image upload), display name, location, bio, and website link. Privacy toggles let you keep your collection visible while hiding your wantlist or value totals — useful if you're tired of getting DMs about books you didn't list for sale.

**Redesigned navbar.** The header is cleaner: a wide search bar with quick icon access to Browse, Marketplace, your Library, and your Profile. Inbox slot is reserved for marketplace messaging when that ships in Phase 2.

**Login and signup.** Faster (30-second auth tolerance for slow networks), recoverable (auto-redirects home if a profile lookup hangs), and prettier (matched to the rest of the site).

**Cover archive: 35,000+ scans and growing.** ComicVine ingestion is now idempotent — re-running the script is free for already-covered volumes, so we can incrementally fill gaps without duplicating work. Recent additions: the full Marvel *Uncanny X-Men* run from 1981–2011 (around 405 issues, all covers archived).

**Series pages got smarter.** Cover-picking now disambiguates by year for runs with multiple volumes, so you stop seeing 1984 Mirage TMNT covers on 2011 IDW issues. Issue-level publication years now fall back to ComicVine cover dates when GCD's data is missing.

**Empty states everywhere.** Hit a clean "Browse the database →" CTA the first time you land on an empty library tab, profile section, or zero-result search.

## What's next

The roadmap for the next 60 days:

- **Insurance/appraisal PDF report** — the primary Pro-tier feature. Itemized PDF with cover thumbnails, grades, slab cert numbers, and a date-stamped total. No other comic platform does this.
- **Founding Collector slots open** — limited to the first 100 supporters at $20/mo. Permanent badge, lowest marketplace fee tier, name on the founders page.
- **Follow / followers system** — see what other collectors are adding, build a wantlist that surfaces to potential sellers.
- **Marketplace soft launch** — Pro users only, slabbed books only, verified grades on every listing.

If you're collecting seriously, this site is being built for you, in public, by one collector in Chicago. Patreon backers see updates a day early and shape the roadmap. [Become a Founding Collector →](https://www.patreon.com/cw/ComixCatalog)`,
};

async function run() {
  console.log(`Publishing: "${POST.title}"`);
  console.log(`Slug: /blog/${POST.slug}`);

  const { data, error } = await supabase
    .from("blog_posts")
    .insert({
      title: POST.title,
      slug: POST.slug,
      excerpt: POST.excerpt,
      content: POST.content,
      published: true,
      published_at: new Date().toISOString(),
      author_id: ADMIN_ID,
    })
    .select()
    .single();

  if (error) {
    console.error("Insert failed:", error);
    if (error.code === "23505") {
      console.error("(That's a unique-constraint violation — a post with this slug already exists. Delete it in Supabase or change the slug constant in this script.)");
    }
    process.exit(1);
  }

  console.log("✓ Published.");
  console.log(`  id:   ${data.id}`);
  console.log(`  url:  ${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/blog/${data.slug}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
