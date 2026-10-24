import Link from "next/link";

export const metadata = {
  title: "Sell from your collection",
  description: "List books from your ComixCatalog library, sell them with Buy now once you set up payouts, or take offers by message.",
};

// Must match what the marketplace actually does today (docs/MARKETPLACE.md and
// docs/marketplace-transactions-spec.md): Buy now for priced listings from
// sellers with payouts set up, offers by message otherwise. Numbers below come
// from mkt_fee_config() and the payout rules; change them together.
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
        <h2>Buy now</h2>
        <p>
          Set up payouts once (Stripe asks for your ID and a bank account; we
          never see either) and every priced listing gets a Buy now button. A
          buyer pays by card, you ship within 3 business days, and orders of $50
          or more need tracking. Books priced $100 or more need front and back
          photos of your copy.
        </p>
        <p>
          You&rsquo;re paid after the order completes, 3 days after delivery. As a
          new seller, payouts also wait at least 14 days after the sale, and
          you can have up to 25 Buy now listings, priced up to $1,000, with up to
          $2,000 in open orders. Those limits lift after 5 completed orders.
        </p>
        <p>
          No ComixCatalog fees during the beta. Stripe&rsquo;s card processing
          (2.9% + 30&cent;) comes out of your payout, and every order shows the
          breakdown.
        </p>
        <h2>Offers by message</h2>
        <p>
          Listings without a price, and sellers who haven&rsquo;t set up payouts,
          take offers by message. Those deals are between you and the buyer, outside
          ComixCatalog.
        </p>
        <div className="content-panel-actions">
          <Link href="/sell/payouts" className="primary-btn">
            Set up payouts
          </Link>
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
