"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/lib/apiClient";
import styles from "./AddToListButton.module.css";

export default function AddToListButton({ issueId, returnPath }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!open || !user) return;

    let cancelled = false;
    authedFetch(`/api/lists?issue=${issueId}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (response.ok) setLists(body);
        else setError(body.error);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load lists.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, user, issueId]);

  if (!user) {
    const next = returnPath || `/issue/gcd-${issueId}`;
    return (
      <Link
        className="add-comic-btn"
        href={`/login?next=${encodeURIComponent(next)}`}
      >
        Add to list
      </Link>
    );
  }

  async function toggle(list) {
    setBusyId(list.id);
    setError("");
    const removing = list.has_issue;
    const url = `/api/lists/${list.id}/items${
      removing ? `?issue=${issueId}` : ""
    }`;
    const response = await authedFetch(url, {
      method: removing ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: removing ? undefined : JSON.stringify({ issue: issueId }),
    });

    if (response.ok) {
      setLists((current) =>
        current.map((row) =>
          row.id === list.id ? { ...row, has_issue: !row.has_issue } : row
        )
      );
    } else {
      setError((await response.json()).error);
    }
    setBusyId(null);
  }

  async function create(event) {
    event.preventDefault();
    if (!newTitle.trim()) return;

    setBusyId("new");
    setError("");
    const response = await authedFetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        is_public: true,
        is_ranked: false,
        issue: issueId,
      }),
    });
    const body = await response.json();

    if (response.ok) window.location.assign(body.url);
    else setError(body.error);
    setBusyId(null);
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className="add-comic-btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Add to list
      </button>
      {open && (
        <div className={styles.menu}>
          {lists.map((list) => (
            <button
              type="button"
              className={styles.row}
              key={list.id}
              disabled={busyId === list.id}
              onClick={() => toggle(list)}
            >
              <span>{list.title}</span>
              <span aria-label={list.has_issue ? "Added" : undefined}>
                {list.has_issue ? "✓" : ""}
              </span>
            </button>
          ))}
          <form className={styles.newForm} onSubmit={create}>
            <input
              className={styles.newInput}
              value={newTitle}
              maxLength={100}
              placeholder="New list title"
              aria-label="New list title"
              onChange={(event) => setNewTitle(event.target.value)}
            />
            <button className={styles.row} disabled={busyId === "new"}>
              {busyId === "new" ? "Creating..." : "Create with this book"}
            </button>
          </form>
          {error && (
            <span className={styles.error} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
