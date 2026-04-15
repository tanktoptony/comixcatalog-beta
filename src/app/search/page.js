"use client";

import dynamic from "next/dynamic";

const SearchPageClient = dynamic(() => import("./SearchPageClient"), {
  ssr: false,
  loading: () => (
    <section className="comic-panel">
      <div className="section-label badge-x">Search</div>
      <h1 className="hero-title">Find Comics</h1>
      <div className="empty-state">Loading search…</div>
    </section>
  ),
});

export default function SearchPage() {
  return <SearchPageClient />;
}