"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";

// Whether this member can use marketplace orders, and how many paid orders
// are waiting on them to ship. Cached for two minutes per browser session
// (each check is a function call); "cc:orders-changed" refreshes it right
// away, e.g. after marking an order shipped.
const KEY = "cc-orders-access-v2";
const TTL_MS = 2 * 60 * 1000;
export const ORDERS_CHANGED_EVENT = "cc:orders-changed";

function readCache() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (cached && Date.now() - cached.at < TTL_MS) return cached;
  } catch {
    /* storage blocked (private mode) or bad JSON: ask the server */
  }
  return null;
}

export function useSellerOrders(enabled = true) {
  const [state, setState] = useState({ allowed: false, toShip: 0 });

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    const load = (force) => {
      const cached = force ? null : readCache();
      if (cached) {
        queueMicrotask(() => {
          if (active) setState({ allowed: cached.allowed, toShip: cached.toShip });
        });
        return;
      }
      authedFetch("/api/orders/access")
        .then(async (response) => {
          if (response.status === 401) return;
          const body = response.ok ? await response.json().catch(() => ({})) : {};
          const next = { allowed: response.ok, toShip: Number(body.to_ship) || 0 };
          try { sessionStorage.setItem(KEY, JSON.stringify({ ...next, at: Date.now() })); } catch { /* storage blocked */ }
          if (active) setState(next);
        })
        .catch(() => {});
    };
    load(false);
    const onChange = () => load(true);
    window.addEventListener(ORDERS_CHANGED_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(ORDERS_CHANGED_EVENT, onChange);
    };
  }, [enabled]);

  return state;
}
