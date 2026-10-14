import { getPublishedPost } from "@/lib/blogData";
import { SITE_URL } from "@/lib/siteUrl";

function descriptionFor(post) {
  if (post.excerpt) return post.excerpt;
  return String(post.content || "")
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 155);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return {};
  const description = descriptionFor(post);
  const url = `${SITE_URL}/blog/${slug}`;
  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    openGraph: { title: post.title, description, url, type: "article" },
  };
}

export default function BlogPostLayout({ children }) {
  return children;
}
