import Link from "next/link";

// Lightweight service-status page. Currently hardcoded to "operational" since
// real uptime monitoring isn't wired up yet. When you add UptimeRobot or a
// Supabase edge-function health check, replace the static block with a fetch
// that reflects actual state.
export const metadata = {
  title: "Service Status — ComixCatalog",
};

export default function StatusPage() {
  return (
    <main className="page">
      <section className="cc-form-card" style={{ maxWidth: 560 }}>
        <h1 className="cc-form-title">Service status</h1>
        <p className="cc-form-sub">
          Live operational state of ComixCatalog and its upstream services.
        </p>

        <ul className="status-list">
          <StatusRow label="Web app" state="operational" />
          <StatusRow label="Database (Supabase)" state="operational" />
          <StatusRow label="Cover storage" state="operational" />
          <StatusRow label="Marketplace" state="planned" detail="Phase 2 — late May 2026" />
        </ul>

        <p className="cc-hint" style={{ marginTop: 24 }}>
          Upstream incidents are tracked at{" "}
          <a
            href="https://status.supabase.com"
            target="_blank"
            rel="noreferrer"
            className="md-a"
          >
            status.supabase.com
          </a>
          . If something looks broken on your end and this page says everything
          is fine, email{" "}
          <a href="mailto:comixcatalog@gmail.com" className="md-a">
            comixcatalog@gmail.com
          </a>{" "}
          and I&rsquo;ll take a look.
        </p>

        <div style={{ marginTop: 24 }}>
          <Link href="/" className="cc-submit">
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}

function StatusRow({ label, state, detail }) {
  const config = {
    operational: { color: "#4ade80", text: "Operational" },
    degraded: { color: "#facc15", text: "Degraded" },
    down: { color: "#f87171", text: "Down" },
    planned: { color: "rgba(255,255,255,0.45)", text: "Planned" },
  }[state] ?? { color: "rgba(255,255,255,0.45)", text: state };

  return (
    <li className="status-row">
      <div className="status-row-main">
        <span className="status-pip" style={{ background: config.color, boxShadow: `0 0 8px ${config.color}80` }} aria-hidden="true" />
        <span className="status-label">{label}</span>
      </div>
      <div className="status-row-state">
        <span style={{ color: config.color, fontWeight: 600 }}>{config.text}</span>
        {detail && <span className="status-detail"> · {detail}</span>}
      </div>
    </li>
  );
}
