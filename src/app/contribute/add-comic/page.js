"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function ContributeAddComicPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState({
    series_title: "",
    issue_number: "",
    publisher: "",
    release_year: "",
    variant_name: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (authLoading || !user?.id) {
      setError("Sign in to contribute a comic.");
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/comics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        release_year: form.release_year ? parseInt(form.release_year, 10) : null,
        created_by: user.id,
      }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      setError("Server returned an invalid response.");
      setSubmitting(false);
      return;
    }

    if (!res.ok) {
      setError(data?.error || "Failed to add comic.");
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);

    // If the API returned a comic with an id, jump to its detail page.
    if (data?.comic?.id) {
      router.push(`/comic/${data.comic.id}`);
    } else {
      // Otherwise reset the form so they can add another.
      setForm({
        series_title: "",
        issue_number: "",
        publisher: "",
        release_year: "",
        variant_name: "",
      });
    }
  }

  return (
    <main className="page">
      <section className="cc-form-card">
        <h1 className="cc-form-title">Contribute a comic</h1>
        <p className="cc-form-sub">
          Help fill gaps in the database. This adds a new entry to the public
          catalog immediately — it does not add anything to your own
          collection. Looking to log a book you own instead?{" "}
          <a href="/library/add">Add it to your library</a>.
        </p>

        <form onSubmit={handleSubmit} className="cc-form">
          <div className="cc-form-grid">
            <div className="cc-field">
              <label htmlFor="cc-series">Series title</label>
              <input
                id="cc-series"
                name="series_title"
                className="cc-input"
                placeholder="Amazing Spider-Man"
                value={form.series_title}
                onChange={handleChange}
                required
              />
            </div>

            <div className="cc-field">
              <label htmlFor="cc-issue">Issue number</label>
              <input
                id="cc-issue"
                name="issue_number"
                className="cc-input"
                placeholder="300"
                value={form.issue_number}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="cc-form-grid">
            <div className="cc-field">
              <label htmlFor="cc-publisher">Publisher</label>
              <input
                id="cc-publisher"
                name="publisher"
                className="cc-input"
                placeholder="Marvel Comics"
                value={form.publisher}
                onChange={handleChange}
                required
              />
            </div>

            <div className="cc-field">
              <label htmlFor="cc-year">Release year</label>
              <input
                id="cc-year"
                name="release_year"
                className="cc-input"
                type="number"
                placeholder="1988"
                value={form.release_year}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="cc-field">
            <label htmlFor="cc-variant">Variant name</label>
            <input
              id="cc-variant"
              name="variant_name"
              className="cc-input"
              placeholder="Cover B, Newsstand, Director's Cut, etc."
              value={form.variant_name}
              onChange={handleChange}
            />
            <span className="cc-hint">Leave blank for the standard cover.</span>
          </div>

          {error && <div className="cc-form-error">{error}</div>}
          {success && (
            <div
              className="cc-form-error"
              style={{
                background: "rgba(74,222,128,0.1)",
                borderColor: "rgba(74,222,128,0.4)",
                color: "#86efac",
              }}
            >
              Comic added. Thanks for contributing.
            </div>
          )}

          <div className="cc-form-actions">
            <button className="cc-submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit comic"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
