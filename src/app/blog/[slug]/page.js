"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function BlogPostPage() {
  const { slug } = useParams();
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState(null);

  const adminId = process.env.NEXT_PUBLIC_ADMIN_USER_ID;

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

    if (!user) {
      setError("Login required to comment.");
      return;
    }

    const res = await fetch("/api/blog/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: post.id,
        user_id: user.id,
        content,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to post comment");
      return;
    }

    setComments([...comments, data.comment]);
    setContent("");
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

  if (!post) return <p>Loading...</p>;

  return (
    <section className="comic-panel news-page">
      <h1 className="hero-title">{post.title}</h1>

      {user?.id === adminId && (
        <button
          onClick={handleDelete}
          style={{
            background: "red",
            color: "white",
            padding: "8px 16px",
            marginBottom: "20px",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Delete Post
        </button>
      )}

      <p className="news-post-date">
        {post.published_at
          ? new Date(post.published_at).toLocaleDateString()
          : ""}
      </p>

      <div className="news-post-body whitespace-pre-line">
        {post.content}
      </div>

      <hr style={{ margin: "40px 0" }} />

      <h2>Comments</h2>

      {comments.map((c) => (
        <div key={c.id} className="comment">
          <p>{c.content}</p>
          <small>
            {new Date(c.created_at).toLocaleString()}
          </small>
        </div>
      ))}

      {user && (
        <form onSubmit={handleComment} className="form mt-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a comment..."
            required
          />
          <button className="primary-btn mt-2">
            Post Comment
          </button>
        </form>
      )}

      {!user && <p>Login to comment.</p>}
    </section>
  );
}
