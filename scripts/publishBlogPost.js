// Publish (or update) a blog post from a Markdown file in content/blog/.
// Replaces the one-shot-per-post version of this script (2026-09-21).
//
//   node scripts/publishBlogPost.js content/blog/getting-back-into-comics.md            # dry run
//   node scripts/publishBlogPost.js content/blog/getting-back-into-comics.md --apply    # insert
//   node scripts/publishBlogPost.js content/blog/getting-back-into-comics.md --apply --update   # upsert by slug
//
// The file starts with a frontmatter block:
//
//   ---
//   title: Getting back into comics (without asking the guy at the counter)
//   slug: getting-back-into-comics
//   excerpt: One paragraph for the blog index and the OpenGraph description.
//   ---
//
// Everything after the closing --- is the post body, in the Markdown subset
// src/components/Markdown.jsx renders (headings, bold, links, lists, and
// standalone image lines). Drafts live in git so they get reviewed like
// code; the founder reads the file, then runs this with --apply.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "../src/lib/siteUrl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";
const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
const UPDATE = process.argv.includes("--update");
if (!file) {
  console.error("usage: node scripts/publishBlogPost.js <content/blog/post.md> [--apply] [--update]");
  process.exit(2);
}

function parse(markdown) {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error("missing frontmatter block (--- ... ---)");
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  for (const k of ["title", "slug", "excerpt"]) {
    if (!meta[k]) throw new Error(`frontmatter is missing "${k}"`);
  }
  if (!/^[a-z0-9-]+$/.test(meta.slug)) throw new Error(`slug "${meta.slug}" must be lowercase letters, digits and hyphens`);
  return { ...meta, content: m[2].trim() };
}

async function run() {
  const post = parse(fs.readFileSync(file, "utf8"));
  const words = post.content.split(/\s+/).length;
  const images = (post.content.match(/^!\[/gm) ?? []).length;
  console.log(`${APPLY ? "Publishing" : "Dry run"}: "${post.title}"`);
  console.log(`  slug:    /blog/${post.slug}`);
  console.log(`  excerpt: ${post.excerpt}`);
  console.log(`  body:    ${words} words, ${images} image(s)`);
  if (!APPLY) { console.log("\nRe-run with --apply to publish."); return; }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const row = {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    published: true,
    author_id: ADMIN_ID,
  };
  let result;
  if (UPDATE) {
    result = await supabase.from("blog_posts").update({ ...row, updated_at: new Date().toISOString() }).eq("slug", post.slug).select().maybeSingle();
    if (!result.error && !result.data) result = { error: { message: `no existing post with slug ${post.slug}; run without --update to insert` } };
  } else {
    result = await supabase.from("blog_posts").insert({ ...row, published_at: new Date().toISOString() }).select().single();
  }
  if (result.error) {
    console.error("Failed:", result.error.message ?? result.error);
    if (result.error.code === "23505") console.error("(A post with this slug already exists. Pass --update to overwrite it.)");
    process.exit(1);
  }
  console.log(`\nDone. ${SITE_URL}/blog/${result.data.slug}`);
}

run().catch((err) => { console.error(err.message ?? err); process.exit(1); });
