"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";

export default function BlogIndexPage() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const isAdmin = user?.id === ADMIN_ID;

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
      <div className="blog-header-row">
        <div>
          <div className="blog-eyebrow">Developer Updates</div>
          <h1 className="blog-title">Danger Room Dispatch</h1>
          <p className="blog-subtitle">
            Behind-the-scenes notes from the ComixCatalog team — what we shipped,
            what we&rsquo;re working on, and what&rsquo;s coming next.
          </p>
        </div>
        {isAdmin && (
          <Link href="/blog/create" className="blog-new-btn" title="Create a new blog post">
            + New post
          </Link>
        )}
      </div>

      {error && <p className="cc-form-error">{error}</p>}

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