import BlogIndexClient from "./BlogIndexClient";
import { getPublishedPosts } from "@/lib/blogData";

// Rebuilt at most every 10 minutes so a new post shows up without a deploy.
export const revalidate = 600;

export const metadata = {
  title: "Danger Room Dispatch",
  description: "Build updates, fixes and collecting guides from the person who builds ComixCatalog.",
};

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts();
  return <BlogIndexClient initialPosts={posts} />;
}
