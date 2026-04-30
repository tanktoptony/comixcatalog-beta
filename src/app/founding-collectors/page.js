import Link from "next/link";

export default function FoundingCollectorsPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Founding Collectors</div>

        <h1>Founding Collectors</h1>

        <p>
          ComixCatalog is opening its first collector slots to people who want
          to help shape the platform early.
        </p>

        <p>
          Founding collectors get early access to collection tools, public
          collector pages, profile features, and future community updates as the
          project grows.
        </p>

        <Link href="/signup" className="primary-btn">
          Create Your Account
        </Link>
      </section>
    </main>
  );
}