import Link from "next/link";

export const metadata = {
  title: "Trust & Safety",
  description: "How Buy now orders are protected on ComixCatalog, how to trade safely by message, and how to report a problem.",
};

export default function TrustPage() {
  return (
    <main className="page-shell">
      <section className="content-panel">
        <div className="section-label badge-x">Trust</div>
        <h1>Trust & Safety</h1>
        <p>
          The ComixCatalog marketplace is in beta. Collectors list books from
          their own libraries. Priced books from sellers who have set up payouts
          have a <strong>Buy now</strong> button, and those orders run through
          ComixCatalog. Everything else is a deal you make by message, outside
          ComixCatalog.
        </p>
        <h2>When you use Buy now</h2>
        <ul>
          <li>You pay by card through Stripe. We never see or store your full card number.</li>
          <li>The seller has 3 business days to ship. Orders of $50 or more ship with tracking.</li>
          <li>
            If the book never shows up or isn&apos;t as described, report it from your
            order page any time before the order completes, which is 3 days after
            delivery. We review it and refund you if the seller can&apos;t make it right.
          </li>
          <li>
            Returns because you changed your mind aren&apos;t covered, but a seller can
            still agree to one in the order thread.
          </li>
          <li>The seller isn&apos;t paid until the order completes.</li>
          <li>US addresses only for now.</li>
        </ul>
        <h2>When you deal by message</h2>
        <ul>
          <li>
            Pay with PayPal Goods & Services, not Friends & Family. Goods &
            Services gives you PayPal&apos;s buyer protection if a book never shows
            up or isn&apos;t as described.
          </li>
          <li>Ask for photos of the exact copy, front and back, before you pay.</li>
          <li>
            For slabbed books, check the cert number on the grading company&apos;s
            website.
          </li>
          <li>
            Keep the conversation in ComixCatalog messages so there&apos;s a record.
          </li>
          <li>
            Walk away from anyone who pushes gift cards, wire transfers, or
            payment apps with no protection.
          </li>
        </ul>
        <h2>What you can see about a seller</h2>
        <p>
          Every listing shows the seller&apos;s username, how long they&apos;ve been
          collecting on ComixCatalog, and their other books for sale. Public
          profiles show their collection, and sellers with completed Buy now
          orders show their rating and buyer feedback on their profile.
        </p>
        <h2>Something wrong?</h2>
        <p>
          If a listing or a member looks off, email{" "}
          <a href="mailto:comixcatalog@gmail.com">comixcatalog@gmail.com</a> with a
          link and we&apos;ll look into it.
        </p>
        <Link href="/marketplace" className="primary-btn">
          View Marketplace
        </Link>
      </section>
    </main>
  );
}
