import Link from "next/link";

export default function SellPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Sell</div>
        <h1>Seller Tools Coming Soon</h1>
        <p>
          Selling tools are planned for a later ComixCatalog phase. The current
          focus is building a reliable collection engine first.
        </p>
        <p>
          Future seller tools may include public sale pages, collection-based
          listings, slab tracking, trust signals, and lightweight marketplace
          workflows.
        </p>
        <Link href="/founding-collectors" className="primary-btn">
          Join for Free Lifetime Pro
        </Link>
      </section>
    </main>
  );
}
