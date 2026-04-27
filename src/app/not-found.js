import Link from "next/link";

export default function NotFound() {
  return (
    <section className="error-shell">
      <div className="error-card">
        <div className="error-kicker">404 — Lost in the long boxes</div>
        <h1 className="error-title">We couldn&rsquo;t find that page.</h1>
        <p className="error-sub">
          The link may be stale, or the comic may have been merged into another record.
        </p>
        <div className="error-actions">
          <Link href="/" className="error-btn primary">
            Back home
          </Link>
          <Link href="/search" className="error-btn">
            Search the database
          </Link>
        </div>
      </div>
    </section>
  );
}
