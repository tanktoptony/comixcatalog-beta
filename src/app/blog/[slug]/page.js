"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Markdown from "@/components/Markdown";

export default function BlogPostPage() {
  const { slug } = useParams();
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState(null);
  const [posting, setPosting] = useState(false);

  const ADMIN_ID = "9ec650a2-8870-4175-82da-99d72cab9efc";

  useEffect(() => {
    if (!slug) return;

    async function loadPost() {
      const res = await fetch(`/api/blog?slug=${slug}`);
      const data = await res.json();

      if (!res.ok) {
        setError("Post not found.");
        return;
      }

      setPost(data.post);
    }

    loadPost();
  }, [slug]);

  useEffect(() => {
    if (!post?.id) return;

    async function loadComments() {
      const res = await fetch(
        `/api/blog/comments?post_id=${post.id}`
      );
      const data = await res.json();
      setComments(data.comments || []);
    }

    loadComments();
  }, [post]);

  async function handleComment(e) {
    e.preventDefault();
    if (!user || posting || !content.trim()) return;

    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/blog/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: post.id,
          user_id: user.id,
          content: content.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to post comment");
        return;
      }

      setComments([...comments, data.comment]);
      setContent("");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this post?")) return;

    const res = await fetch(`/api/blog?id=${post.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user?.id,
      }),
    });

    if (res.ok) {
      window.location.href = "/blog";
    } else {
      alert("Delete failed");
    }
  }

  if (error && !post) {
    return (
      <main className="page">
        <section className="cc-form-card">
          <h1 className="cc-form-title">Post not found</h1>
          <p className="cc-form-sub">{error}</p>
          <Link href="/blog" className="cc-submit" style={{ marginTop: 12 }}>
            Back to all posts
          </Link>
        </section>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="page">
        <section className="blog-post-article">
          <p className="cc-hint">Loading…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <article className="blog-post-article">
        <Link href="/blog" className="blog-back-link">
          ← Back to all posts
        </Link>

        <header className="blog-post-header">
          <p className="blog-post-date">
            {post.published_at
              ? new Date(post.published_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : ""}
            <span className="blog-post-byline"> · Danger Room Dispatch</span>
          </p>
          <h1 className="blog-post-title">{post.title}</h1>
          {post.excerpt && (
            <p className="blog-post-lede">{post.excerpt}</p>
          )}
          {user && user.id === ADMIN_ID && (
            <div className="blog-post-admin-row">
              <button
                type="button"
                onClick={handleDelete}
                className="blog-post-delete"
              >
                Delete post
              </button>
            </div>
          )}
        </header>

        <div className="blog-post-body">
          <Markdown source={post.content} />
        </div>

        <section className="blog-comments">
          <h2 className="blog-comments-title">
            Comments {comments.length > 0 && <span className="blog-comments-count">({comments.length})</span>}
          </h2>

          {comments.length === 0 && (
            <p className="cc-hint" style={{ marginBottom: 16 }}>
              No comments yet. {user ? "Be the first." : ""}
            </p>
          )}

          <ul className="blog-comments-list">
            {comments.map((c) => (
              <li key={c.id} className="blog-comment">
                <div className="blog-comment-meta">
                  <span className="blog-comment-author">
                    {c.author_username || "Collector"}
                  </span>
                  <span className="blog-comment-date">
                    {new Date(c.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="blog-comment-body">{c.content}</p>
              </li>
            ))}
          </ul>

          {user ? (
            <form onSubmit={handleComment} className="blog-comment-form">
              <label htmlFor="bc-content" className="blog-comment-form-label">
                Add a comment
              </label>
              <textarea
                id="bc-content"
                className="cc-textarea"
                placeholder="What did you think?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                required
              />
              {error && <div className="cc-form-error" style={{ marginTop: 8 }}>{error}</div>}
              <div className="blog-comment-form-actions">
                <button
                  type="submit"
                  className="cc-submit"
                  disabled={posting || !content.trim()}
                >
                  {posting ? "Posting…" : "Post comment"}
                </button>
              </div>
            </form>
          ) : (
            <div className="blog-comment-signin">
              <Link href="/login" className="cc-submit">
                Sign in to comment
              </Link>
            </div>
          )}
        </section>
      </article>
    </main>
  );
}
