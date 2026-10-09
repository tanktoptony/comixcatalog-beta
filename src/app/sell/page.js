import Link from "next/link";

// Must match what the marketplace actually does today (docs/MARKETPLACE.md):
// listings from the library, offers by message, nothing paid through us.
export default function SellPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Sell</div>
        <h1>Sell from your collection</h1>
        <p>
          Any book in your library can be listed for sale. Mark it for sale, set a
          price or leave it open to offers, add up to 10 photos and your condition
          notes, and it shows up in the marketplace and on that issue&rsquo;s page.
        </p>
        <p>
          The marketplace is in beta. Buyers message you to make an offer, and you
          work out payment and shipping with them directly. There&rsquo;s no checkout,
          no buyer protection and no payout through ComixCatalog yet, and no fees
          during the beta.
        </p>
        <p>
          If we add checkout later, listings you make now carry over. You won&rsquo;t
          have to list anything again.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/library" className="primary-btn">
            Go to your library
          </Link>
          <Link href="/marketplace" className="primary-btn">
            Browse the marketplace
          </Link>
        </div>
      </section>
    </main>
  );
}
