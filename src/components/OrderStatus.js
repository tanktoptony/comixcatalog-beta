/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authedFetch } from "@/lib/apiClient";

export default function OrderStatus({ id }) {
  const success = useSearchParams().get("checkout") === "success";
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let timer;
    const start = Date.now();
    async function load() {
      try {
        const response = await authedFetch(`/api/orders/${id}`);
        if (response.status === 404) {
          setState({ notFound: true });
          return;
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setState({ order: result.order });
        if (
          success
          && ["created", "awaiting_payment"].includes(result.order.status)
          && Date.now() - start < 60000
        ) {
          timer = setTimeout(load, 3000);
        }
      } catch (error) {
        setState({ error: error.message });
      }
    }
    load();
    return () => clearTimeout(timer);
  }, [id, success]);

  if (state.loading) return <main className="order-page"><p>Loading order...</p></main>;
  if (state.notFound) return <main className="order-page"><h1>Order not found</h1></main>;
  if (state.error) {
    return (
      <main className="order-page">
        <h1>Could not load order</h1>
        <p>{state.error}</p>
      </main>
    );
  }
  const order = state.order;
  const processing = success && ["created", "awaiting_payment"].includes(order.status);
  return (
    <main className="order-page">
      {order.cover_url && <img src={order.cover_url} alt="" />}
      <div>
        <p className="mk-beta">Marketplace order</p>
        <h1>
          {order.series_title}
          {order.issue_number ? ` #${order.issue_number}` : ""}
        </h1>
        <strong>${(order.total_cents / 100).toFixed(2)}</strong>
        <p>{processing ? "Payment processing" : order.status.replaceAll("_", " ")}</p>
      </div>
    </main>
  );
}
