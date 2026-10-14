import BlogPostClient from "./BlogPostClient";
import { getPublishedPost } from "@/lib/blogData";

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  return <BlogPostClient initialPost={post} />;
}
