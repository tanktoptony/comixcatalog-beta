"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import styles from "./PayoutsPrompt.module.css";

// Points sellers at /sell/payouts. Renders nothing unless the viewer can use
// checkout (the status route 404s otherwise). `showWhenReady` keeps a small
// "manage" row once payouts are set up, for the account page.
// `card` wraps it in an account-page section with links to orders and for-sale books;
// like the prompt itself, the whole card stays hidden outside the checkout allowlist.
export default function PayoutsPrompt({ showWhenReady = false, card = null }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    let active = true;
    authedFetch("/api/sell/stripe/status")
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        if (active) setState({ seller: body.seller || null });
      })
      .catch((error) => console.error("payout status check failed:", error));
    return () => {
      active = false;
    };
  }, []);

  if (!state) return null;
  const body = renderPrompt(state.seller, showWhenReady);
  if (!card) return body;
  return (
    <section className={card.className} id="selling">
      <div className={card.headingClassName}><h2>Selling</h2></div>
      {body}
      <p className={styles.links}>
        <Link href="/orders">Your orders</Link> · <Link href="/library?tab=for_sale">Your for-sale books</Link>
      </p>
    </section>
  );
}

function renderPrompt(seller, showWhenReady) {
  const ready = Boolean(seller?.charges_enabled && seller?.details_submitted);
  const restricted = seller && ["limited", "suspended"].includes(seller.tier);

  if (ready && !restricted) {
    if (!showWhenReady) return null;
    return (
      <div className={`${styles.prompt} ${styles.quiet}`}>
        <div>
          <strong>Payouts are set up</strong>
          <span>Buyers can check out on your priced listings.</span>
        </div>
        <Link href="/sell/payouts" className={styles.secondary}>Manage payouts</Link>
      </div>
    );
  }

  if (restricted) {
    return (
      <div className={`${styles.prompt} ${styles.quiet}`}>
        <div>
          <strong>Checkout is paused on your account</strong>
          <span>Your listings still show, and buyers can message you.</span>
        </div>
        <Link href="/sell/payouts" className={styles.secondary}>Details</Link>
      </div>
    );
  }

  const started = Boolean(seller);
  return (
    <div className={styles.prompt}>
      <div>
        <strong>{started ? "Finish setting up payouts" : "Get paid through ComixCatalog"}</strong>
        <span>
          {started
            ? "Stripe still needs a few details before buyers can check out on your books."
            : "Set up payouts with Stripe and buyers can check out on your priced books. Takes about 5 minutes."}
        </span>
      </div>
      <Link href="/sell/payouts" className={styles.primary}>{started ? "Continue setup" : "Set up payouts"}</Link>
    </div>
  );
}
