"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors thrown by the root layout itself,
// where Header/Footer aren't available. Must render its own <html>/<body>.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1230",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ color: "#F4D03F", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>
            ComixCatalog
          </div>
          <h1 style={{ margin: "0.75rem 0", fontSize: "1.75rem" }}>
            We&rsquo;re briefly offline.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: "1.5rem" }}>
            Something unexpected broke the layout. Try refreshing — if it keeps happening,
            check back in a few minutes.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#F4D03F",
              color: "#000",
              border: "none",
              padding: "0.65rem 1.5rem",
              borderRadius: 6,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error?.digest && (
            <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
              ref: {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
