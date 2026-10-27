/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";
import { statusLabel } from "@/lib/orders";
import { money, orderGrade, orderNextStep, orderTitle } from "@/lib/orderRows";
import { coverThumb } from "@/lib/coverThumb";
import styles from "@/app/orders/orders.module.css";
import PayoutsPrompt from "@/components/PayoutsPrompt";

function OrderRow({ order, role }) {
  const selling = role === "selling";
  const step = orderNextStep(order, role);
  const closed = ["cancelled", "refunded"].includes(order.status);
  const covers = (order.items?.length ? order.items : [{ cover_url: order.cover_url }]).slice(0, 3);
  return (
    <Link href={`/orders/${order.id}`} className={styles.row}>
      <div className={styles.cover}>{covers.map((item, index) => item.cover_url && <img src={coverThumb(item.cover_url)} alt="" key={`${item.listing_id || order.id}-${index}`} />)}</div>
      <div className={styles.body}>
        <strong>{orderTitle(order)}{order.test && <em className={styles.test}>Test</em>}</strong>
        <span>{orderGrade(order)}</span>
        <span>{selling ? "Sold to" : "From"} <b>@{selling ? order.buyer_username : order.seller_username}</b></span>
        {step.text && <span className={styles.step} data-tone={step.tone}>{step.text}</span>}
      </div>
      <div className={styles.meta}>
        <b>{money(order.total_cents)}</b>
        {selling && !closed && order.paid_at && <small>You get {money(order.seller_net_cents)}</small>}
        <span className={styles.chip} data-tone={step.tone}>{statusLabel(order.status)}</span>
        <time dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
      </div>
    </Link>
  );
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
        totals: before ? current.totals : result.totals,
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
      {state.totals?.some((total) => total.value && total.value !== "$0.00") && (
        <dl className={styles.totals}>{state.totals.map((total) => <div key={total.label}><dt>{total.label}</dt><dd>{total.value}</dd></div>)}</dl>
      )}
      {state.loading && <p className={styles.state}>Loading the receipts...</p>}
      {state.error && <p className={styles.state}>Could not load orders. {state.error}</p>}
      {!state.loading && !state.error && state.orders.length === 0 && (
        <p className={styles.state}>Nothing {role === "buying" ? "bought" : "sold"} yet. <Link href="/marketplace">The marketplace is that way.</Link></p>
      )}
      <div className={styles.list}>
        {state.orders.map((order) => <OrderRow order={order} role={role} key={order.id} />)}
      </div>
      {state.more && <button className={styles.more} onClick={() => load(state.orders.at(-1).created_at)}>Load more</button>}
    </main>
  );
}
