"use client";

import Link from "next/link";

export default function MarketplacePage() {
  return (
    <section className="comic-panel">
      <div className="section-label badge-x">Marketplace</div>
      <h1 className="hero-title" style={{ marginBottom: "1rem" }}>
        Collector Listings (Coming Soon)
      </h1>

      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        The ComixCatalog Marketplace will allow verified collectors and sellers
        to list their comics with condition notes, provenance, and photo proof —
        not vague “VG-ish” listings. You’ll be able to search by title, grade,
        and creator across thousands of verified copies.
      </p>

      <p>
        <strong>Current focus:</strong> building out the collector tools and
        early backer network. If you’d like to be among the first verified
        sellers,{" "}
        <Link href="https://www.patreon.com/comixcatalog" className="text-[#f7c400]">
          become a Founding Collector
        </Link>{" "}
        and we’ll reach out when listings open.
      </p>
    </section>
  );
}
