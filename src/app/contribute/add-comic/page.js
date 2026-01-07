"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddComicPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    series_title: "",
    issue_number: "",
    publisher: "",
    release_year: "",
    variant_name: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/comics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        release_year: form.release_year
          ? parseInt(form.release_year, 10)
          : null,
      }),
    });

    let data = null;

    try {
      data = await res.json();
    } catch {
      setError("Server returned an invalid response");
      setLoading(false);
      return;
    }


    if (!res.ok) {
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

  }

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto" }}>
      <h1>Add a Comic</h1>

      {success && <p style={{ color: "green" }}>Comic added successfully!</p>}

      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div>
          <label>Series Title *</label>
          <input
            name="series_title"
            value={form.series_title}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Issue Number *</label>
          <input
            name="issue_number"
            value={form.issue_number}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Publisher *</label>
          <input
            name="publisher"
            value={form.publisher}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Release Year</label>
          <input
            name="release_year"
            type="number"
            value={form.release_year}
            onChange={handleChange}
          />
        </div>

        <div>
          <label>Variant Name</label>
          <input
            name="variant_name"
            value={form.variant_name}
            onChange={handleChange}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Adding…" : "Add Comic"}
        </button>
      </form>
    </div>
  );
}
