// One-shot publisher for the August 2026 build update post. Uses the
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
  title: "What's new — August 2026 build update",
  slug: "august-2026-build-update",
  excerpt:
    "Search finally works the way it should — faster, and it doesn't bury or duplicate the book you're looking for. Plus 109,000+ covers archived and climbing. Here's what changed.",
  content: `Search has been the biggest complaint we've heard, and the biggest fix this month. Here's what changed.

## What's new

**Search is actually fast now.** Every search used to mean scanning all ~208,000 series with no index behind it — that "staggered loading" feeling was a literal full-table scan on every keystroke pause. Fixed with a real index. An exact-title search that used to take over a second now returns in about 150 milliseconds.

**Search stopped losing the book you wanted.** Search a title with a lot of entries — a heavily-published run like Spider-Man or Batman — and the volume you actually wanted could get buried behind hundreds of one-shots and crossovers that just happened to share a word, and never make it into your results at all. Search now ranks by real relevance to what you typed before anything gets cut off, not by issue count.

**Fewer duplicate volumes cluttering results.** The Grand Comics Database occasionally splits one real comic-book run across multiple internal entries — same book, same publisher, same everything, just fractured into pieces. Those fragments were showing up in search as if they were separate volumes. We're now collapsing the ones we can positively identify, so results better reflect what's actually out there to collect.

**109,000+ covers archived, growing every hour.** Cover ingestion now runs continuously instead of in occasional bursts. We're tracking it against a real target too — every issue from a commercially-released US-market run — and we're about a third of the way through that, with hundreds more landing every day.

If you're collecting seriously, this site is being built for you, in public, by one collector in Chicago. [Become a Founding Collector →](https://www.patreon.com/cw/ComixCatalog)`,
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
