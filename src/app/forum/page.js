import Link from "next/link";

export default function ForumPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Forum</div>
        <h1>Collector Forum Coming Soon</h1>
        <p>
          The ComixCatalog forum is not live yet. Community tools are planned
          after the core collection features are stable.
        </p>
        <p>
          For now, founding collectors will help shape what the community layer
          should become.
        </p>
        <Link href="/founding-collectors" className="primary-btn">
          Join the Founding Collectors
        </Link>
      </section>
    </main>
  );
}