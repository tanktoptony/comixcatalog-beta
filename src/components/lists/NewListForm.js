"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import styles from "./Lists.module.css";

export default function NewListForm() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const response = await authedFetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        is_public: form.get("public") === "on",
        is_ranked: form.get("ranked") === "on",
      }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body.error || "Could not create list.");
      setBusy(false);
      return;
    }

    router.push(body.url);
  }

  if (!loading && !user) {
    return (
      <div className={styles.empty}>
        <span>Sign in to make a list.</span>
        <Link className={styles.button} href="/login?next=%2Flists%2Fnew">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        Title
        <input name="title" maxLength={100} required autoFocus />
      </label>
      <label>
        Description
        <textarea name="description" maxLength={1000} rows={5} />
      </label>
      <label className={styles.check}>
        <input name="public" type="checkbox" defaultChecked />
        Public
      </label>
      <label className={styles.check}>
        <input name="ranked" type="checkbox" />
        Show rank numbers
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.button} disabled={busy}>
        {busy ? "Creating..." : "Create list"}
      </button>
    </form>
  );
}
