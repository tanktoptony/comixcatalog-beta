/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { shipByLabel } from "@/lib/shipBy";
import { useSellerOrders } from "@/hooks/useSellerOrders";

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}

// Sold books waiting on the seller, at the top of their library. A sale
// takes the book off the shelf, so without this the book just vanished.
export default function SellerToShip() {
  const { allowed, toShip } = useSellerOrders();
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!allowed || toShip === 0) return undefined;
    let active = true;
    authedFetch("/api/orders?role=selling")
      .then((response) => (response.ok ? response.json() : { orders: [] }))
      .then((body) => {
        if (active) setOrders((body.orders ?? []).filter((order) => order.status === "paid"));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [allowed, toShip]);

  if (!allowed || toShip === 0 || orders.length === 0) return null;

  return (
    <section className="to-ship" aria-labelledby="to-ship-title">
      <h2 id="to-ship-title" className="to-ship-title">
        You sold {orders.length === 1 ? "a book" : `${orders.length} books`}. Time to ship.
      </h2>
      <ul className="to-ship-list">
        {orders.map((order) => (
          <li key={order.id} className="to-ship-item">
            {order.cover_url ? <img src={order.cover_url} alt="" className="to-ship-cover" /> : <span className="to-ship-cover" aria-hidden="true" />}
            <div className="to-ship-copy">
              <strong>{order.series_title}{order.issue_number ? ` #${order.issue_number}` : ""}</strong>
              <span>Ship by {shipByLabel(order.paid_at)} · you get {money(order.seller_net_cents)}</span>
            </div>
            <Link href={`/orders/${order.id}?ship=1`} className="to-ship-btn">Add tracking</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
