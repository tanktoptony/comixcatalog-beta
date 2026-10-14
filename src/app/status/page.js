import Link from "next/link";

// Lightweight service-status page. Currently hardcoded to "operational" since
// real uptime monitoring isn't wired up yet. When you add UptimeRobot or a
// Supabase edge-function health check, replace the static block with a fetch
// that reflects actual state.
export const metadata = {
  title: "Service Status",
};

export default function StatusPage() {
  return (
    <main className="page">
      <section className="cc-form-card status-panel">
        <h1 className="cc-form-title">Service status</h1>
        <p className="cc-form-sub">
          Live operational state of ComixCatalog and its upstream services.
        </p>

        <ul className="status-list">
          <StatusRow label="Web app" state="operational" />
          <StatusRow label="Database (Supabase)" state="operational" />
          <StatusRow label="Cover storage" state="operational" />
          <StatusRow label="Marketplace" state="beta" detail="Listings and messages live, no checkout yet" />
        </ul>

        <p className="cc-hint status-note">
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

        <div className="status-home-link">
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
    beta: { color: "var(--cc-gold)", text: "Beta" },
    planned: { color: "rgba(255,255,255,0.45)", text: "Planned" },
  }[state] ?? { color: "rgba(255,255,255,0.45)", text: state };

  return (
    <li className="status-row">
      <div className="status-row-main">
        <span className="status-pip" style={{ "--status-color": config.color }} aria-hidden="true" />
        <span className="status-label">{label}</span>
      </div>
      <div className="status-row-state">
        <span className="status-state-value" style={{ "--status-color": config.color }}>{config.text}</span>
        {detail && <span className="status-detail"> · {detail}</span>}
      </div>
    </li>
  );
}
