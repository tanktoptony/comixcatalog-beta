"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { authedFetch } from "@/lib/apiClient";
import { shipByLabel } from "@/lib/shipBy";
import { useSellerOrders } from "@/hooks/useSellerOrders";

// "Oct 28": the year only adds width on a phone.
const shortDate = (paidAt) => shipByLabel(paidAt).replace(/, \d{4}$/, "");

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents ?? 0) / 100);
}

// One slim line at the top of the seller's library while sold books wait to
// ship. A sale takes the book off the shelf, so without this it just
// vanished. One order links straight to its shipment form; several link to
// Orders.
export default function SellerToShip() {
  const { allowed, toShip } = useSellerOrders();
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!allowed || toShip === 0) return undefined;
    let active = true;
    authedFetch("/api/orders?role=selling")
      .then((response) => (response.ok ? response.json() : { orders: [] }))
      .then((body) => {
        if (!active) return;
        const paid = (body.orders ?? []).filter((order) => order.status === "paid");
        // Oldest payment first: that one ships soonest.
        setOrders(paid.sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at))));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [allowed, toShip]);

  if (!allowed || toShip === 0 || orders.length === 0) return null;
  const next = orders[0];
  const single = orders.length === 1;
  // Multi-book orders name the first book and count the rest.
  const first = next.items?.[0] || next;
  const more = (next.items?.length || 1) - 1;
  const title = `${first.series_title}${first.issue_number ? ` #${first.issue_number}` : ""}${more > 0 ? ` and ${more} more` : ""}`;

  return (
    <Link href={single ? `/orders/${next.id}?ship=1` : "/orders"} className="to-ship-bar">
      <Package size={16} strokeWidth={2.2} aria-hidden="true" />
      <span className="to-ship-text">
        {single
          ? <>Ship <strong>{title}</strong> by {shortDate(next.paid_at)} · you get {money(next.seller_net_cents)}</>
          : <><strong>{orders.length} sales to ship</strong> · next by {shortDate(next.paid_at)}</>}
      </span>
      <span className="to-ship-action">{single ? "Add tracking" : "View orders"} →</span>
    </Link>
  );
}
