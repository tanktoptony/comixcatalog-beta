import Link from "next/link";

export default function CommunityGuidelinesPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Community</div>
        <h1>Community Guidelines</h1>
        <p>
          ComixCatalog community features are still being built. Founding
          collectors will help shape how discussions, contributions, trust, and
          collector-to-collector tools work.
        </p>
        <p>
          For now, keep things collector-friendly: be accurate, be respectful,
          and do not submit intentionally misleading comic data.
        </p>
        <Link href="/founding-collectors" className="primary-btn">
          Become a Founding Collector
        </Link>
      </section>
    </main>
  );
}