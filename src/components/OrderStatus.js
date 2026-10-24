/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ORDERS_CHANGED_EVENT } from "@/hooks/useSellerOrders";
import { authedFetch } from "@/lib/apiClient";
import { statusLabel } from "@/lib/orders";
import { trackingUrl } from "@/lib/tracking";
import { feedbackRatingLabel } from "@/lib/feedback";
import { findOffPlatformPaymentTerms } from "@/lib/messageContent";
import ReportButton from "@/components/ReportButton";
import styles from "@/app/orders/[id]/order.module.css";

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
}).format((value || 0) / 100);

const PAYMENT_WARNING = "Heads up: payments outside ComixCatalog checkout aren't covered. If someone asks for Friends and Family, Zelle, a wire or gift cards, that's the classic scam.";

export default function OrderStatus({ id }) {
  const searchParams = useSearchParams();
  const success = searchParams.get("checkout") === "success";
  const [state, setState] = useState({ loading: true });
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  // ?ship=1 (from the seller's "To ship" card) opens the shipment form.
  const [shipping, setShipping] = useState(searchParams.get("ship") === "1");
  const [carrier, setCarrier] = useState("usps");
  const [tracking, setTracking] = useState("");
  const [feedbackRating, setFeedbackRating] = useState("");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeKind, setDisputeKind] = useState("not_received");
  const [disputeReason, setDisputeReason] = useState("");
  const load = useCallback(async () => {
    try {
      const [orderResponse, messagesResponse] = await Promise.all([
        authedFetch(`/api/orders/${id}`),
        authedFetch(`/api/orders/${id}/messages`),
      ]);
      if (orderResponse.status === 404) {
        setState({ notFound: true });
        return;
      }
      const orderResult = await orderResponse.json();
      const messagesResult = await messagesResponse.json();
      if (!orderResponse.ok) throw new Error(orderResult.error);
      if (!messagesResponse.ok) throw new Error(messagesResult.error);
      setState({ order: orderResult.order });
      setMessages(messagesResult.messages);
    } catch (error) {
      setState({ error: error.message });
    }
  }, [id]);

  useEffect(() => {
    const firstLoad = setTimeout(load, 0);
    const timer = setInterval(load, 15000);
    return () => {
      clearTimeout(firstLoad);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!success || !state.order || !["created", "awaiting_payment"].includes(state.order.status)) return;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [load, state.order, success]);

  async function action(path, payload) {
    const response = await authedFetch(`/api/orders/${id}/${path}`, {
      method: "POST",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      setState((current) => ({ ...current, actionError: result.error }));
      return;
    }
    setShipping(false);
    window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
    await load();
  }

  async function sendMessage(event) {
    event.preventDefault();
    const response = await authedFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id, body }),
    });
    const result = await response.json();
    if (!response.ok) {
      setState((current) => ({ ...current, actionError: result.error }));
      return;
    }
    setBody("");
    await load();
  }

  async function leaveFeedback(event) {
    event.preventDefault();
    setFeedbackBusy(true);
    try {
      const response = await authedFetch(`/api/orders/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: feedbackRating, comment: feedbackComment }),
      });
      const result = await response.json();
      if (!response.ok) {
        setState((current) => ({ ...current, actionError: result.error }));
        return;
      }
      await load();
    } catch (error) {
      setState((current) => ({ ...current, actionError: error.message }));
    } finally {
      setFeedbackBusy(false);
    }
  }

  if (state.loading) return <main className={styles.page}><p>Loading order...</p></main>;
  if (state.notFound) return <main className={styles.page}><h1>Order not found</h1></main>;
  if (state.error) return <main className={styles.page}><h1>Could not load order</h1><p>{state.error}</p></main>;
  const order = state.order;
  const processing = success && ["created", "awaiting_payment"].includes(order.status);
  const trackLink = trackingUrl(order.tracking?.carrier, order.tracking?.number);
  const person = order.role === "buyer" ? order.seller_username : order.buyer_username;
  return (
    <main className={styles.page}>
      <Link href="/orders">Back to orders</Link>
      <section className={styles.receipt}>
        <div className={order.items?.length > 1 ? styles.coverStack : styles.cover}>{(order.items?.length ? order.items : [{ cover_url: order.cover_url }]).map((item, index) => item.cover_url && <img src={item.cover_url} alt="" key={`${item.listing_id || order.id}-${index}`} />)}</div>
        <div className={styles.details}>
          <p className={styles.eyebrow}>Marketplace receipt</p>
          <h1>{order.items?.length > 1 ? `${order.items.length} books from @${order.seller_username}` : `${order.series_title}${order.issue_number ? ` #${order.issue_number}` : ""}`}</h1>
          {order.items?.length > 1 && <ul>{order.items.map((item) => <li key={item.listing_id}>{item.series_title}{item.issue_number ? ` #${item.issue_number}` : ""} · {money(item.item_cents)}</li>)}</ul>}
          <p>{[order.variant_label, order.printing_name].filter(Boolean).join(" · ")}</p>
          {order.items?.length > 1 ? null : order.slab_company ? (
            <div className={styles.slab}>{order.slab_company} <strong>{order.grade_numeric}</strong><small>Cert {order.slab_cert_number}</small></div>
          ) : <p>Grade: {order.condition || order.grade_numeric || "Not specified"}</p>}
          <p>{order.role === "buyer" ? "Sold by" : "Bought by"} <strong>@{person}</strong></p>
          <span className={styles.status}>{processing ? "Payment processing" : statusLabel(order.status)}</span>
          <dl className={styles.money}>
            <div><dt>{order.items?.length > 1 ? `${order.items.length} books` : "Item"}</dt><dd>{money(order.item_cents)}</dd></div>
            <div><dt>Shipping</dt><dd>{money(order.shipping_cents)}</dd></div>
            <div><dt>Tax</dt><dd>{money(order.tax_cents)}</dd></div>
            <div className={styles.total}><dt>Total</dt><dd>{money(order.total_cents)}</dd></div>
            {order.role === "seller" && <>
              <div><dt>Processing fee</dt><dd>-{money(order.processing_fee_cents)}</dd></div>
              <div><dt>Platform fee</dt><dd>-{money(order.platform_fee_cents)}</dd></div>
              <div className={styles.total}><dt>Net payout</dt><dd>{money(order.seller_net_cents)}</dd></div>
            </>}
          </dl>
        </div>
        <aside>
          <h2>Timeline</h2>
          <ol className={styles.timeline}>{order.timeline.map((entry) => <li key={entry.status}><strong>{statusLabel(entry.status)}</strong><time>{new Date(entry.at).toLocaleString()}</time></li>)}</ol>
          {order.tracking?.number && <p>Tracking: {trackLink ? <a href={trackLink} target="_blank" rel="noreferrer">{order.tracking.number}</a> : order.tracking.number}</p>}
          {order.ship_to && <address className={styles.address}><strong>Ship to</strong>{order.ship_to.name}<br />{order.ship_to.address?.line1}<br />{order.ship_to.address?.line2 && <>{order.ship_to.address.line2}<br /></>}{order.ship_to.address?.city}, {order.ship_to.address?.state} {order.ship_to.address?.postal_code}</address>}
          <div className={styles.actions}>
            {order.actions.mark_shipped && <button onClick={() => setShipping(true)}>Mark shipped</button>}
            {order.actions.confirm_delivery && <button onClick={() => confirm("Got it and it's as described?") && action("confirm-delivery")}>Confirm delivery</button>}
            {order.actions.cancel_refund && <button className={styles.danger} onClick={() => confirm("Cancel this order and issue a full refund?") && action("cancel")}>Cancel and refund</button>}
            {order.actions.open_dispute && <button className={styles.quiet} type="button" onClick={() => setDisputeOpen(true)}>Problem with this order?</button>}
          </div>
          {disputeOpen && <form className={styles.shipForm} onSubmit={(event) => { event.preventDefault(); action("dispute", { kind: disputeKind, reason: disputeReason }); }}>
            <label>Problem<select value={disputeKind} onChange={(event) => setDisputeKind(event.target.value)}><option value="not_received">Never arrived</option><option value="not_as_described">Not as described</option></select></label>
            <label>What happened?<textarea value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} minLength={10} maxLength={2000} required rows={5} /><small>{disputeReason.length}/2000</small></label>
            <p>An admin reviews disputes within a few days. The order thread is the record, so describe supporting details in the thread.</p>
            <button disabled={disputeReason.trim().length < 10}>Open dispute</button>
            <button type="button" onClick={() => setDisputeOpen(false)}>Cancel</button>
          </form>}
          {shipping && order.actions.mark_shipped && <form className={styles.shipForm} onSubmit={(event) => { event.preventDefault(); action("ship", { carrier, tracking_number: tracking }); }}><label>Carrier<select value={carrier} onChange={(event) => setCarrier(event.target.value)}><option value="usps">USPS</option><option value="ups">UPS</option><option value="fedex">FedEx</option><option value="dhl">DHL</option><option value="other">Other</option></select></label><label>Tracking number<input value={tracking} onChange={(event) => setTracking(event.target.value)} /></label><small>Tracking is required for orders of $50 or more.</small><button>Save shipment</button></form>}
          {state.actionError && <p className={styles.error}>{state.actionError}</p>}
        </aside>
      </section>
      {(order.disputes?.length > 0 || order.refunds?.length > 0) && <section className={styles.feedbackCard}>
        <h2>Disputes and refunds</h2>
        {order.disputes?.map((dispute) => <article key={`${dispute.kind}-${dispute.opened_at}`}><p><strong>{dispute.status === "open" ? "Dispute under review" : "Dispute resolved"}</strong></p><p>{dispute.kind === "not_received" ? "Never arrived" : dispute.kind === "not_as_described" ? "Not as described" : "Chargeback"}</p>{dispute.resolution_note && <p>{dispute.resolution_note}</p>}</article>)}
        {order.refunds?.map((refund) => <p key={refund.created_at}><strong>{money(refund.amount_cents)} refunded</strong> on {new Date(refund.created_at).toLocaleDateString()}</p>)}
      </section>}
      {order.status === "completed" && (
        <section className={styles.feedbackCard}>
          <h2>Order feedback</h2>
          {order.feedback.can_leave ? (
            <form onSubmit={leaveFeedback}>
              <p>Your feedback stays hidden until both of you rate or 14 days pass.</p>
              <div className={styles.ratingChoices}>
                {["positive", "neutral", "negative"].map((rating) => (
                  <button type="button" className={feedbackRating === rating ? styles.ratingSelected : ""} onClick={() => setFeedbackRating(rating)} key={rating}>
                    <span aria-hidden="true">{rating === "positive" ? "★" : rating === "neutral" ? "●" : "▼"}</span>
                    {rating[0].toUpperCase() + rating.slice(1)}
                  </button>
                ))}
              </div>
              <label>
                <span>Comment</span>
                <textarea value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} maxLength={500} rows={4} />
                <small>{feedbackComment.length}/500</small>
              </label>
              <button disabled={!feedbackRating || feedbackBusy}>{feedbackBusy ? "Saving..." : "Leave feedback"}</button>
            </form>
          ) : order.feedback.mine ? (
            <div>
              <p>You left: <strong>{feedbackRatingLabel(order.feedback.mine.rating)}</strong></p>
              {order.feedback.mine.comment && <p>{order.feedback.mine.comment}</p>}
              {!order.feedback.theirs && new Date(order.feedback.mine.visible_at).getTime() > Date.now() && <p>Visible on {new Date(order.feedback.mine.visible_at).toLocaleDateString()}</p>}
            </div>
          ) : <p>The feedback window closed.</p>}
          {order.feedback.theirs && (
            <article className={styles.receivedFeedback}>
              <h3>Feedback from @{person}</h3>
              <p><strong>{feedbackRatingLabel(order.feedback.theirs.rating)}</strong></p>
              {order.feedback.theirs.comment && <p>{order.feedback.theirs.comment}</p>}
              <ReportButton targetType="feedback" targetId={order.id} ownerId={order.role === "buyer" ? order.seller_id : order.buyer_id} />
            </article>
          )}
        </section>
      )}
      <section className={styles.thread}>
        <h2>Order thread</h2>
        <div className={styles.messages}>{messages.length === 0 && <p>No messages yet.</p>}{messages.map((message) => <article className={message.is_system ? styles.system : ""} key={message.id}>{findOffPlatformPaymentTerms(message.body).length > 0 && <div className={styles.paymentWarning}>{PAYMENT_WARNING}</div>}<p>{message.body}</p><time>{new Date(message.created_at).toLocaleString()}</time></article>)}</div>
        <form onSubmit={sendMessage}><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={4000} placeholder="Write a message about this order" required /><button>Send</button></form>
      </section>
    </main>
  );
}
