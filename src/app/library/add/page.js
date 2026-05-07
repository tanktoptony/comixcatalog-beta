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
      <section className="cc-form-card">
        <h1 className="cc-form-title">Add a comic</h1>
        <p className="cc-form-sub">
          Manually add an issue to your personal collection. Used for raw
          books or anything not already indexed in the database.
        </p>

        <form onSubmit={handleSubmit} className="cc-form">
          <div className="cc-form-grid">
            <div className="cc-field">
              <label htmlFor="ac-series">Series title</label>
              <input
                id="ac-series"
                className="cc-input"
                required
                placeholder="Amazing Spider-Man"
                value={form.series_title}
                onChange={(e) =>
                  setForm({ ...form, series_title: e.target.value })
                }
              />
            </div>

            <div className="cc-field">
              <label htmlFor="ac-issue">Issue number</label>
              <input
                id="ac-issue"
                className="cc-input"
                required
                placeholder="300"
                value={form.issue_number}
                onChange={(e) =>
                  setForm({ ...form, issue_number: e.target.value })
                }
              />
            </div>
          </div>

          <div className="cc-form-grid">
            <div className="cc-field">
              <label htmlFor="ac-publisher">Publisher</label>
              <input
                id="ac-publisher"
                className="cc-input"
                required
                placeholder="Marvel Comics"
                value={form.publisher}
                onChange={(e) =>
                  setForm({ ...form, publisher: e.target.value })
                }
              />
            </div>

            <div className="cc-field">
              <label htmlFor="ac-year">Release year</label>
              <input
                id="ac-year"
                className="cc-input"
                type="number"
                placeholder="1988"
                value={form.release_year}
                onChange={(e) =>
                  setForm({ ...form, release_year: e.target.value })
                }
              />
            </div>
          </div>

          <div className="cc-field">
            <label>Cover image</label>
            <div className="cc-file-row">
              <label className="cc-file-btn">
                Choose image
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  hidden
                />
              </label>
              <span className="cc-file-name">
                {coverFile ? coverFile.name : "No file selected"}
              </span>
            </div>
            <span className="cc-hint">JPG or PNG, optional. Used until the issue is matched to a canonical scan.</span>
          </div>

          {error && <div className="cc-form-error">{error}</div>}

          <div className="cc-form-actions">
            <button className="cc-submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add to collection"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
