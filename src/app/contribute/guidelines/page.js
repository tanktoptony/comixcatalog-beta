import Link from "next/link";

export default function ContributeGuidelinesPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Contribute</div>
        <h1>Contribution Guidelines</h1>
        <p>
          ComixCatalog is building toward cleaner, collector-friendly comic
          data. Contribution tools are not fully open yet, but future
          submissions should prioritize accuracy, source clarity, and clean
          issue-level information.
        </p>
        <p>
          Cover images, issue metadata, variants, publishers, and creator data
          should be reviewed carefully before being accepted.
        </p>
        <Link href="/founding-collectors" className="primary-btn">
          Join for Free Lifetime Pro
        </Link>
      </section>
    </main>
  );
}
