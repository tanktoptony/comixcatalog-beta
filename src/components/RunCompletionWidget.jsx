// "Runs you're close to finishing" — aggregates the same owned-vs-total
// math /series/[id] already computes per-series (via /api/library/run-
// completion), surfaced as a sidebar widget on /library and /u/[username]
// so it's visible without clicking into any one series first. Owner-only:
// always reflects the signed-in caller's own collection (server-derived
// from the auth token), never the profile being viewed.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/apiClient";

export default function RunCompletionWidget() {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authedFetch("/api/library/run-completion", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setRuns(data?.runs ?? []);
      } catch (err) {
        console.error("RunCompletionWidget load failed:", err);
        if (!cancelled) setError(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (error || !runs || runs.length === 0) return null;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 12,
      }}
    >
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: "0.75rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        Runs you&rsquo;re close to finishing
      </h3>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {runs.map((run) => (
          <li key={run.series_id}>
            <Link
              href={`/series/${run.series_id}`}
              style={{
                display: "block",
                padding: "8px 0",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.85rem" }}>
                <span style={{ opacity: 0.9, fontWeight: 600 }}>{run.title}</span>
                <span style={{ opacity: 0.65, fontWeight: 600, flexShrink: 0 }}>{run.pct}%</span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  marginTop: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${run.pct}%`,
                    background: "var(--cc-gold, #FFD700)",
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: 4 }}>
                {run.owned} of {run.total} &mdash; {run.missing} to go
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
