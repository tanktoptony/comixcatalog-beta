// Server-only blog reads, shared by the blog pages and their metadata so the
// article is in the first HTML instead of fetched from the browser.
import { cache } from "react";
import { getServiceClient } from "@/lib/supabase/service";

// Same rows /api/blog returns. A failed read returns null so the client
// component falls back to its own fetch instead of rendering an empty page.
export const getPublishedPost = cache(async (slug) => {
  const { data, error } = await getServiceClient()
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) {
    console.error("blog post read failed:", error.message);
    return null;
  }
  return data ?? null;
});

export const getPublishedPosts = cache(async () => {
  const { data, error } = await getServiceClient()
    .from("blog_posts")
    .select("*")
    .eq("published", true)
    .order("published_at", { ascending: false });
  if (error) {
    console.error("blog index read failed:", error.message);
    return null;
  }
  return data ?? [];
});
