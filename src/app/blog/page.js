"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BlogIndexPage() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadPosts() {
      const res = await fetch("/api/blog");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load posts");
        return;
      }

      setPosts(data.posts || []);
    }

    loadPosts();
  }, []);

  return (
    <section className="blog-page">
      <div className="blog-eyebrow">Developer Updates</div>
      <h1 className="blog-title">Danger Room Dispatch</h1>
      <p className="blog-subtitle">
        Behind-the-scenes notes from the ComixCatalog team — what we shipped,
        what we&rsquo;re working on, and what&rsquo;s coming next.
      </p>

      <div className="blog-list">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/blog/${post.slug}`}
            className="blog-card"
          >
            <div className="blog-card-date">
              {new Date(post.created_at).toLocaleDateString()}
            </div>

            <div className="blog-card-title">
              {post.title}
            </div>

            <div className="blog-card-excerpt">
              {post.excerpt}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}