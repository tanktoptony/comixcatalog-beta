"use client";

import { startTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AppError({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    console.error("App-level error:", error);
  }, [error]);

  // reset() alone re-renders the same failed server payload, so the button
  // looked dead on server errors. Refetch from the server first.
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <section className="error-shell">
      <div className="error-card">
        <div className="error-kicker">Something went wrong</div>
        <h1 className="error-title">This page hit a snag.</h1>
        <p className="error-sub">
          The rest of ComixCatalog is still working. Try again, head back home,
          or search for what you were looking for.
        </p>
        <div className="error-actions">
          <button type="button" className="error-btn primary" onClick={retry}>
            Try again
          </button>
          <Link href="/" className="error-btn">
            Back home
          </Link>
          <Link href="/search" className="error-btn">
            Search
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
