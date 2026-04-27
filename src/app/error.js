"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({ error, reset }) {
  useEffect(() => {
    console.error("App-level error:", error);
  }, [error]);

  return (
    <section className="error-shell">
      <div className="error-card">
        <div className="error-kicker">Something went wrong</div>
        <h1 className="error-title">This page hit a snag.</h1>
        <p className="error-sub">
          The rest of ComixCatalog is still working. Try again, head back to your library,
          or refresh the page.
        </p>
        <div className="error-actions">
          <button type="button" className="error-btn primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/library" className="error-btn">
            Back to library
          </Link>
        </div>
        {error?.digest && (
          <div className="error-digest" title="Reference ID for debugging">
            ref: {error.digest}
          </div>
        )}
      </div>
    </section>
  );
}
