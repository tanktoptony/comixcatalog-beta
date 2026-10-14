// Server-only blog reads, shared by the blog pages and their metadata so the
// article is in the first HTML instead of fetched from the browser.
import { cache } from "react";
import { getServiceClient } from "@/lib/supabase/service";

// Same rows /api/blog returns. A failed read returns null so the client
// component falls back to its own fetch instead of rendering an empty page.
// A missing service key (CI builds) throws instead of returning an error.
async function read(label, run) {
  try {
    const { data, error } = await run(getServiceClient());
    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    console.error(`${label} failed:`, error.message);
    return undefined;
  }
}

export const getPublishedPost = cache(async (slug) => {
  const post = await read("blog post read", (supabase) => supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle());
  return post ?? null;
});

export const getPublishedPosts = cache(async () => {
  const posts = await read("blog index read", (supabase) => supabase
    .from("blog_posts")
    .select("*")
    .eq("published", true)
    .order("published_at", { ascending: false }));
  return posts === undefined ? null : posts ?? [];
});
