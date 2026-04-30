import Link from "next/link";

export default function TrustPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Trust</div>
        <h1>Trust & Safety</h1>
        <p>
          Trust tools are planned for ComixCatalog as the marketplace and
          collector-to-collector features develop.
        </p>
        <p>
          The goal is to support safer collecting through public collection
          pages, clearer seller history, verified ownership signals, and
          transparent listing behavior.
        </p>
        <Link href="/marketplace" className="primary-btn">
          View Marketplace
        </Link>
      </section>
    </main>
  );
}