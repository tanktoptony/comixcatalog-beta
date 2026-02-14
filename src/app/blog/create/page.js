"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

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

  if (!user || user.id !== process.env.NEXT_PUBLIC_ADMIN_USER_ID) {
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

    console.log("Sending user_id:", user?.id);

    const res = await fetch("/api/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        user_id: user.id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to create post");
      setSaving(false);
      return;
    }

    router.push(`/blog/${data.post.slug}`);
  }

  return (
    <section className="comic-panel">
      <h1>Create Blog Post</h1>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="form">
        <input
          placeholder="Title"
          value={form.title}
          onChange={(e) =>
            setForm({ ...form, title: e.target.value })
          }
          required
        />

        <input
          placeholder="Slug (unique)"
          value={form.slug}
          onChange={(e) =>
            setForm({ ...form, slug: e.target.value })
          }
          required
        />

        <input
          placeholder="Excerpt"
          value={form.excerpt}
          onChange={(e) =>
            setForm({ ...form, excerpt: e.target.value })
          }
        />

        <textarea
          placeholder="Content"
          value={form.content}
          onChange={(e) =>
            setForm({ ...form, content: e.target.value })
          }
          rows={12}
          required
        />

        <button className="primary-btn">
          {saving ? "Publishing..." : "Publish"}
        </button>
      </form>
    </section>
  );
}
