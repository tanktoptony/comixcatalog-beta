/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { statusLabel } from "@/lib/orders";
import styles from "@/app/orders/orders.module.css";
import PayoutsPrompt from "@/components/PayoutsPrompt";

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function OrdersList() {
  const [role, setRole] = useState("buying");
  const [state, setState] = useState({ loading: true, orders: [] });
  const load = useCallback(async (before) => {
    if (!before) setState({ loading: true, orders: [] });
    try {
      const query = new URLSearchParams({ role });
      if (before) query.set("before", before);
      const response = await authedFetch(`/api/orders?${query}`);
      if (response.status === 404) {
        setState({ notFound: true, orders: [] });
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setState((current) => ({
        loading: false,
        orders: before ? [...current.orders, ...result.orders] : result.orders,
        more: result.orders.length === 25,
      }));
    } catch (error) {
      setState({ error: error.message, orders: [] });
    }
  }, [role]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (state.notFound) return <main className={styles.page}><h1>Not found</h1></main>;
  return (
    <main className={styles.page}>
      <header><p className={styles.eyebrow}>Marketplace</p><h1>Your orders</h1></header>
      <div className={styles.tabs} role="tablist">
        {["buying", "selling"].map((value) => (
          <button key={value} role="tab" aria-selected={role === value} onClick={() => setRole(value)}>{value === "buying" ? "Buying" : "Selling"}</button>
        ))}
      </div>
      {role === "selling" && <PayoutsPrompt />}
      {state.loading && <p className={styles.state}>Loading the receipts...</p>}
      {state.error && <p className={styles.state}>Could not load orders. {state.error}</p>}
      {!state.loading && !state.error && state.orders.length === 0 && (
        <p className={styles.state}>Nothing {role === "buying" ? "bought" : "sold"} yet. <Link href="/marketplace">The marketplace is that way.</Link></p>
      )}
      <div className={styles.list}>
        {state.orders.map((order) => (
          <Link href={`/orders/${order.id}`} className={styles.row} key={order.id}>
            <div className={styles.cover}>{order.cover_url && <img src={order.cover_url} alt="" />}</div>
            <div><strong>{order.series_title}{order.issue_number ? ` #${order.issue_number}` : ""}</strong><span>{order.slab_company ? `${order.slab_company} ${order.grade_numeric || ""}` : order.condition || "Raw"}</span></div>
            <div className={styles.meta}><b>{money(order.total_cents)}</b><span className={styles.chip}>{statusLabel(order.status)}</span><time>{new Date(order.created_at).toLocaleDateString()}</time></div>
          </Link>
        ))}
      </div>
      {state.more && <button className={styles.more} onClick={() => load(state.orders.at(-1).created_at)}>Load more</button>}
    </main>
  );
}
