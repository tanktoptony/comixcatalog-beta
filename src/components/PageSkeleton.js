// Instant placeholder shown by Next's loading.js while a server-rendered
// page (profile, series, search) builds, so a click never looks like it did
// nothing. Pure markup + CSS; no data.
export default function PageSkeleton({ variant = "grid", tiles = 12 }) {
  return (
    <div className="page-skel" role="status" aria-live="polite" aria-label="Loading">
      {variant === "profile" && (
        <div className="page-skel-head">
          <span className="page-skel-avatar skel" />
          <div className="page-skel-lines">
            <span className="skel page-skel-line w40" />
            <span className="skel page-skel-line w25" />
          </div>
        </div>
      )}
      {variant !== "profile" && (
        <div className="page-skel-lines">
          <span className="skel page-skel-line w30 tall" />
          <span className="skel page-skel-line w50" />
        </div>
      )}
      <div className="page-skel-stats">
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} className="skel page-skel-stat" />
        ))}
      </div>
      <div className="page-skel-grid">
        {Array.from({ length: tiles }, (_, i) => (
          <span key={i} className="skel page-skel-tile" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
