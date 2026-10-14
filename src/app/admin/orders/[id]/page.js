"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/apiClient";

const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);

export default function AdminOrderPage({ params }) {
  const [id, setId] = useState(null);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("seller");
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionRefund, setResolutionRefund] = useState("");
  const [sellerReason, setSellerReason] = useState("");
  const [tier, setTier] = useState("new");
  const load = useCallback(async (orderId) => {
    const response = await authedFetch(`/api/admin/orders/${orderId}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load order.");
    setOrder(result.order);
    setRefundAmount(((result.order.total_cents - result.order.refunded_cents) / 100).toFixed(2));
    setResolutionRefund(((result.order.total_cents - result.order.refunded_cents) / 100).toFixed(2));
    setTier(result.order.seller_account?.tier || "new");
  }, []);
  useEffect(() => {
    Promise.resolve(params).then(({ id: orderId }) => { setId(orderId); return load(orderId); }).catch((loadError) => setError(loadError.message));
  }, [params, load]);
  async function refund(event) {
    event.preventDefault();
    const cents = Math.round(Number(refundAmount) * 100);
    if (!confirm(`Refund ${money(cents)}? This moves money immediately.`)) return;
    const response = await authedFetch(`/api/admin/orders/${id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount_cents: cents, reason }) });
    const result = await response.json();
    if (!response.ok) return setError(result.error || "Refund failed.");
    setMessage("Refund sent and recorded.");
    await load(id);
  }
  async function postAction(path, body, confirmation, success) {
    setError("");
    setMessage("");
    if (!confirm(confirmation)) return;
    const response = await authedFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Action failed.");
      return;
    }
    setMessage(success);
    await load(id);
  }
  async function resolveDispute(event) {
    event.preventDefault();
    const refundCents = outcome === "buyer" ? Math.round(Number(resolutionRefund) * 100) : null;
    await postAction(
      `/api/admin/orders/${id}/resolve-dispute`,
      { outcome, note: resolutionNote, refund_cents: refundCents },
      `Resolve this dispute for the ${outcome}?`,
      "Dispute resolved.",
    );
  }
  async function freezeSeller(frozen) {
    await postAction(
      `/api/admin/sellers/${order.seller_id}/freeze`,
      { frozen, reason: sellerReason },
      `${frozen ? "Freeze" : "Unfreeze"} this seller's payouts?`,
      `Seller payouts ${frozen ? "frozen" : "unfrozen"}.`,
    );
  }
  async function setSellerTier(event) {
    event.preventDefault();
    await postAction(
      `/api/admin/sellers/${order.seller_id}/tier`,
      { tier, reason: sellerReason },
      `Set this seller's tier to ${tier}?`,
      "Seller tier updated.",
    );
  }
  async function resolveFlag(kind) {
    await postAction(
      `/api/admin/orders/${id}/flags/${kind}/resolve`,
      {},
      `Mark ${kind.replaceAll("_", " ")} reviewed?`,
      "Flag marked reviewed.",
    );
  }
  if (!order) return <main className="admin-shell"><p>{error || "Loading..."}</p></main>;
  return <main className="admin-shell"><header className="admin-header"><p className="admin-kicker">Admin Order</p><h1 className="admin-title">{order.series_title} {order.issue_number ? `#${order.issue_number}` : ""}</h1><p className="admin-lede">{order.id}</p></header>
    {error && <p className="admin-err">{error}</p>}{message && <p className="admin-message ok">{message}</p>}
    <section className="admin-card"><h2 className="admin-card-title">Receipt</h2><p>Status: {order.status}. Total: {money(order.total_cents)}. Refunded: {money(order.refunded_cents)}.</p><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(order.ship_to, null, 2)}</pre>{Object.entries(order.stripe_links).map(([label, link]) => link && <p key={label}><a href={link} target="_blank" rel="noreferrer">Stripe {label}</a></p>)}</section>
    <section className="admin-card"><h2 className="admin-card-title">Refund</h2><form className="admin-form" onSubmit={refund}><label>Amount<input className="admin-input" type="number" min="0.01" step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} /></label><label>Reason<input className="admin-input" minLength={3} required value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="admin-btn admin-btn-danger">Review refund</button></form></section>
    <section className="admin-card"><h2 className="admin-card-title">Disputes</h2>{order.disputes.map((dispute) => <article key={dispute.id}><p><strong>{dispute.kind}</strong>: {dispute.status}</p><p>{dispute.reason_text}</p>{dispute.resolution_note && <p>{dispute.resolution_note}</p>}</article>)}</section>
    <section className="admin-card"><h2 className="admin-card-title">Flags</h2>{order.flags.length === 0 && <p>No flags.</p>}{order.flags.map((flag) => <article key={flag.kind}><p><strong>{flag.kind.replaceAll("_", " ")}</strong>{flag.resolved_at ? ` reviewed ${new Date(flag.resolved_at).toLocaleString()}` : ""}</p><pre>{JSON.stringify(flag.detail, null, 2)}</pre>{!flag.resolved_at && <button className="admin-btn" type="button" onClick={() => resolveFlag(flag.kind)}>Mark reviewed</button>}</article>)}</section>
    {order.disputes.some((dispute) => dispute.status === "open") && <section className="admin-card"><h2 className="admin-card-title">Resolve dispute</h2><form className="admin-form" onSubmit={resolveDispute}><fieldset><legend>Outcome</legend>{["buyer", "seller", "withdrawn"].map((value) => <label key={value}><input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} /> {value}</label>)}</fieldset><label>Resolution note<input className="admin-input" minLength={3} required value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} /></label>{outcome === "buyer" && <label>Refund amount<input className="admin-input" type="number" min="0.01" step="0.01" required value={resolutionRefund} onChange={(event) => setResolutionRefund(event.target.value)} /></label>}<button className="admin-btn admin-btn-danger">Review resolution</button></form></section>}
    <section className="admin-card"><h2 className="admin-card-title">Seller controls</h2><p>Tier: {order.seller_account?.tier || "unknown"}. Payouts: {order.seller_account?.payouts_frozen ? "frozen" : "active"}.</p><label>Reason<input className="admin-input" minLength={3} required value={sellerReason} onChange={(event) => setSellerReason(event.target.value)} /></label><div className="admin-actions"><button className="admin-btn" type="button" disabled={sellerReason.trim().length < 3} onClick={() => freezeSeller(!order.seller_account?.payouts_frozen)}>{order.seller_account?.payouts_frozen ? "Review unfreeze" : "Review freeze"}</button></div><form className="admin-form" onSubmit={setSellerTier}><label>Tier<select className="admin-input" value={tier} onChange={(event) => setTier(event.target.value)}>{["new", "established", "limited", "suspended"].map((value) => <option key={value}>{value}</option>)}</select></label><button className="admin-btn" disabled={sellerReason.trim().length < 3}>Review tier change</button></form></section>
    <section className="admin-card"><h2 className="admin-card-title">Order thread</h2>{order.messages.map((entry) => <p key={entry.id}>{entry.body}</p>)}</section>
    <section className="admin-card"><h2 className="admin-card-title">Audit</h2>{order.audit.map((entry) => <p key={entry.id}>{entry.action}</p>)}</section>
  </main>;
}
