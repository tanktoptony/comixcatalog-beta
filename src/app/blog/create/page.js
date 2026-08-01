"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { ADMIN_ID } from "@/lib/admin";
import { authedFetch } from "@/lib/apiClient";

export default function NewBlogPostPage() {

  const { user } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
  });

  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!user) {
    return <p>Loading...</p>;
  }

  if (user.id !== ADMIN_ID) {
    return <p>Unauthorized</p>;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!user) {
      setError("User not loaded yet.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await authedFetch("/api/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to create post");
      setSaving(false);
      return;
    }

    router.push(`/blog/${data.post.slug}`);
  }

  // Auto-derive a URL-safe slug from the title as the user types it,
  // unless they've manually edited the slug already.
  const [slugTouched, setSlugTouched] = useState(false);
  function handleTitleChange(value) {
    const next = { ...form, title: value };
    if (!slugTouched) {
      next.slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    }
    setForm(next);
  }

  return (
    <main className="page">
      <section className="cc-form-card">
        <h1 className="cc-form-title">New blog post</h1>
        <p className="cc-form-sub">
          Publishing under <strong>Danger Room Dispatch</strong>. Posts go
          live immediately at <code>/blog/&lt;slug&gt;</code>.
        </p>

        <form onSubmit={handleSubmit} className="cc-form">
          <div className="cc-field">
            <label htmlFor="bp-title">Title</label>
            <input
              id="bp-title"
              className="cc-input"
              placeholder="What we shipped this week"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
            />
          </div>

          <div className="cc-field">
            <label htmlFor="bp-slug">Slug</label>
            <input
              id="bp-slug"
              className="cc-input"
              placeholder="what-we-shipped-this-week"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: e.target.value });
              }}
              required
            />
            <span className="cc-hint">
              URL-safe, unique. Auto-filled from the title — edit if you want a shorter URL.
            </span>
          </div>

          <div className="cc-field">
            <label htmlFor="bp-excerpt">Excerpt</label>
            <input
              id="bp-excerpt"
              className="cc-input"
              placeholder="One-line teaser shown on the blog index."
              value={form.excerpt}
              onChange={(e) =>
                setForm({ ...form, excerpt: e.target.value })
              }
            />
          </div>

          <div className="cc-field">
            <label htmlFor="bp-content">Content</label>
            <textarea
              id="bp-content"
              className="cc-textarea"
              placeholder="Full post body. Markdown supported."
              value={form.content}
              onChange={(e) =>
                setForm({ ...form, content: e.target.value })
              }
              rows={16}
              required
            />
            <span className="cc-hint">Markdown is supported. Headings, links, bold/italic, code blocks all render.</span>
          </div>

          {error && <div className="cc-form-error">{error}</div>}

          <div className="cc-form-actions">
            <button className="cc-submit" disabled={saving}>
              {saving ? "Publishing…" : "Publish post"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
