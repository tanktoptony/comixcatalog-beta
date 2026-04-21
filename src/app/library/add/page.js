"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function AddComicPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [form, setForm] = useState({
    series_title: "",
    issue_number: "",
    publisher: "",
    release_year: "",
  });

  const [coverFile, setCoverFile] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (loading || !user?.id) {
      setError("Auth not ready.");
      setSubmitting(false);
      return;
    }

    const fd = new FormData();
    fd.append("series_title", form.series_title);
    fd.append("issue_number", form.issue_number);
    fd.append("publisher", form.publisher);
    if (form.release_year) fd.append("release_year", form.release_year);
    if (coverFile) fd.append("cover", coverFile);
    fd.append("created_by", user.id);

    const res = await fetch("/api/comics", {
      method: "POST",
      body: fd,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      setError("Server error while creating comic.");
      setSubmitting(false);
      return;
    }

    if (!res.ok || !data?.comic?.id) {
      setError(data?.error || "Failed to create comic.");
      setSubmitting(false);
      return;
    }

    router.push(`/comic/${data.comic.id}`);
  }

  return (
    <main className="page">
      <section className="form-card">
        <h1 className="form-title">Add Comic</h1>
        <p className="form-subtitle">
          Manually add a comic to your personal collection.
        </p>

        <form onSubmit={handleSubmit} className="form">
          <div className="grid-2">
            <div className="field">
              <label>Series Title</label>
              <input
                required
                placeholder="Amazing Spider-Man"
                value={form.series_title}
                onChange={(e) =>
                  setForm({ ...form, series_title: e.target.value })
                }
              />
            </div>

            <div className="field">
              <label>Issue Number</label>
              <input
                required
                placeholder="300"
                value={form.issue_number}
                onChange={(e) =>
                  setForm({ ...form, issue_number: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label>Publisher</label>
              <input
                required
                placeholder="Marvel Comics"
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
                placeholder="1988"
                value={form.release_year}
                onChange={(e) =>
                  setForm({ ...form, release_year: e.target.value })
                }
              />
            </div>
          </div>

          <div className="field">
            <label>Cover Image (optional)</label>

            <div className="file-upload">
              <label className="file-button">
                Add Cover Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  hidden
                />
              </label>

              <span className="file-name">
                {coverFile ? coverFile.name : "No file selected"}
              </span>
            </div>
            
            <small>JPG or PNG, optional</small>
          </div>
          
          {error && <p className="error">{error}</p>}

          <hr />
          <br />
          <button className="primary-btn" disabled={submitting}>
            {submitting ? "Adding…" : "Add Comic"}
          </button>
        </form>
      </section>
    </main>
  );
}
