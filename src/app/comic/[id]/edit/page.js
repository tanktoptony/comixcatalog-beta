"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function EditComicPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();

  const [form, setForm] = useState({
    series_title: "",
    issue_number: "",
    publisher: "",
    release_year: "",
  });

  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 🔹 Load existing comic
  useEffect(() => {
  if (!id || loading) return;

  async function loadComic() {
    const res = await fetch("/api/comics");
    const data = await res.json();

    const found = data.comics?.find(
      (c) => String(c.id) === String(id)
    );

    if (!found) {
      setError("Comic not found.");
      return;
    }

    if (!user) {
      setError("Not authenticated.");
      return;
    }

    if (user.id !== found.created_by) {
      setError("You do not have permission to edit this comic.");
      return;
    }

    setForm({
      series_title: found.series_title ?? "",
      issue_number: found.issue_number ?? "",
      publisher: found.publisher ?? "",
      release_year: found.release_year ?? "",
    });
  }

  loadComic();
}, [id, user, loading]);


  async function handleUpdate(e) {
    e.preventDefault();

    if (!user?.id) {
      setError("Not authenticated.");
      return;
    }

    setSaving(true);
    setError(null);

    const res = await fetch(`/api/comics/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        user_id: user.id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to update.");
      setSaving(false);
      return;
    }

    router.push(`/comic/${id}`);
  }

  async function handleDelete() {
    if (!confirm("Delete this comic permanently?")) return;

    setDeleting(true);

    const res = await fetch(`/api/comics/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Delete failed.");
      setDeleting(false);
      return;
    }

    router.push("/search");
  }

  return (
    <main className="page">
      <section className="form-card">
        <h1 className="form-title">Edit Comic</h1>

        {error && <p className="error">{error}</p>}

        <form onSubmit={handleUpdate} className="form">
          <div className="field">
            <label>Series Title</label>
            <input
              value={form.series_title}
              onChange={(e) =>
                setForm({ ...form, series_title: e.target.value })
              }
            />
          </div>

          <div className="field">
            <label>Issue Number</label>
            <input
              value={form.issue_number}
              onChange={(e) =>
                setForm({ ...form, issue_number: e.target.value })
              }
            />
          </div>

          <div className="field">
            <label>Publisher</label>
            <input
              value={form.publisher}
              onChange={(e) =>
                setForm({ ...form, publisher: e.target.value })
              }
            />
          </div>

          <div className="field">
            <label>Release Year</label>
            <input
              type="number"
              value={form.release_year}
              onChange={(e) =>
                setForm({ ...form, release_year: e.target.value })
              }
            />
          </div>

          <button className="primary-btn" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>

        <hr style={{ margin: "24px 0" }} />

        <button
          className="primary-btn"
          style={{ background: "crimson" }}
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting..." : "Delete Comic"}
        </button>
      </section>
    </main>
  );
}
