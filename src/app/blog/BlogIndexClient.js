"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ADMIN_ID } from "@/lib/admin";

// initialPosts comes from the server render (page.js); null falls back to the
// client fetch.
export default function BlogIndexClient({ initialPosts = null }) {
  const [posts, setPosts] = useState(initialPosts ?? []);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const isAdmin = user?.id === ADMIN_ID;

  useEffect(() => {
    if (initialPosts) return;

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
  }, [initialPosts]);

  return (
    <section className="blog-page">
      <div className="blog-header-row">
        <div>
          <div className="blog-eyebrow">Developer Updates</div>
          <h1 className="blog-title">Danger Room Dispatch</h1>
          <p className="blog-subtitle">
            Behind-the-scenes notes from Tony about what shipped, what changed,
            and how ComixCatalog gets built.
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
