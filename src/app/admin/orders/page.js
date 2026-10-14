"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";

const statuses = ["", "paid", "shipped", "disputed", "refunded"];
const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function AdminOrdersPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const params = new URLSearchParams({ q: query, status });
    const response = await authedFetch(`/api/admin/orders?${params}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load orders.");
    setOrders(result.orders);
  }, [query, status]);
  useEffect(() => {
    const timer = setTimeout(() => {
      load().catch((loadError) => setError(loadError.message));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  return <main className="admin-shell">
    <header className="admin-header"><p className="admin-kicker">Admin Tools</p><h1 className="admin-title">Orders</h1><p className="admin-lede">Search receipts, disputes, refunds, and transfers.</p></header>
    <form className="admin-form" onSubmit={(event) => { event.preventDefault(); load().catch((loadError) => setError(loadError.message)); }}><input className="admin-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order, username, or book" /><button className="admin-btn">Search</button></form>
    <div className="admin-actions">{statuses.map((value) => <button className={`admin-btn ${status === value ? "admin-btn-primary" : ""}`} type="button" key={value || "all"} onClick={() => setStatus(value)}>{value || "all"}</button>)}</div>
    {error && <p className="admin-err">{error}</p>}
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>Order</th><th>Date</th><th>Buyer</th><th>Seller</th><th>Book</th><th>Total</th><th>Status</th><th>Flags</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><Link href={`/admin/orders/${order.id}`}>{order.id.slice(0, 8)}</Link></td><td>{new Date(order.created_at).toLocaleDateString()}</td><td>@{order.buyer_username}</td><td>@{order.seller_username}</td><td>{order.series_title} {order.issue_number ? `#${order.issue_number}` : ""}</td><td>{money(order.total_cents)}</td><td>{order.status}</td><td>{[...(order.flags || []), order.open_dispute && "open dispute", order.refunded_cents > 0 && "refunded", order.transferred_at && "transferred"].filter(Boolean).map((flag) => <span className="admin-chip" key={flag}>{flag.replaceAll("_", " ")}</span>)}</td></tr>)}</tbody></table></div>
  </main>;
}
