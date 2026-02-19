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
    <section className="comic-panel news-page">
      <div className="section-label badge-x">Developer Updates</div>
      <h1 className="hero-title mb-6">ComixCatalog Blog</h1>

      {error && <p className="error">{error}</p>}

      {posts.length === 0 && !error && (
        <p>No posts published yet.</p>
      )}

      {posts.map((post) => (
        <article key={post.id} className="news-post mb-10">
          <h2>
            <Link href={`/blog/${post.slug}`}>
              {post.title}
            </Link>
          </h2>

          <p className="news-post-date">
            {post.published_at
              ? new Date(post.published_at).toLocaleDateString()
              : ""}
          </p>

          <p>
            {post.excerpt || post.content.slice(0, 200)}...
          </p>
        </article>
      ))}
    </section>
  );
}