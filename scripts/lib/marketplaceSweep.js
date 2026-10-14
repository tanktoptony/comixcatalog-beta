import { handlePaidSession } from "../../src/lib/marketplaceWebhook.js";
import { afterOrderTransition } from "../../src/lib/orderEvents.js";

function dataOrThrow(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

async function sweepTransitionCandidates(db) {
  const query = db.from("orders").select("*").in("status", ["shipped", "delivered"]);
  if (typeof query.limit !== "function") return [];
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return data || [];
}

async function publishSweepTransitions(db, before) {
  if (!before.length) return;
  const previous = new Map(before.map((order) => [order.id, order.status]));
  const { data, error } = await db.from("orders").select("*").in("id", [...previous.keys()]);
  if (error) throw error;
  for (const order of data || []) {
    if (order.status === previous.get(order.id)) continue;
    if (order.status === "delivered" || order.status === "completed") {
      await afterOrderTransition(db, order, order.status);
    }
  }
}

export async function runMarketplaceSweep({
  db,
  stripe,
  notifyAdmin,
  apply = true,
  log = console.log,
  now = new Date(),
}) {
  const summary = {
    expired: 0,
    db: {},
    transferred: 0,
    skippedRefunded: 0,
    errors: 0,
  };
  // Keyset by id: cancelled rows drop out of the filter, so offset paging would skip rows.
  let afterId = "00000000-0000-0000-0000-000000000000";

  do {
    const result = await db
      .from("orders")
      .select("*")
      .in("status", ["created", "awaiting_payment"])
      .lt("checkout_expires_at", now.toISOString())
      .gt("id", afterId)
      .order("id")
      .limit(200);
    const orders = dataOrThrow(result) || [];

    for (const order of orders) {
      try {
        if (!apply) {
          summary.expired++;
          continue;
        }
        if (order.status === "awaiting_payment" && order.stripe_checkout_session_id) {
          const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
          if (session.status === "complete") {
            await handlePaidSession(session, null, { db, stripe, notifyAdmin });
            continue;
          }
          if (session.status === "open") {
            await stripe.checkout.sessions.expire(order.stripe_checkout_session_id);
          }
        }
        const cancelledResult = await dataOrThrow(await db.rpc("order_transition", {
          p_order: order.id,
          p_to: "cancelled",
          p_actor_id: null,
          p_actor_role: "system",
          p_payload: {},
          p_request_id: null,
          p_stripe_event_id: null,
        }));
        await afterOrderTransition(db, cancelledResult || { ...order, status: "cancelled" }, "cancelled");
        summary.expired++;
      } catch (error) {
        summary.errors++;
        log(`Order ${order.id} expiry failed: ${error.message}`);
      }
    }
    if (orders.length < 200) break;
    afterId = orders[orders.length - 1].id;
  } while (true);

  if (apply) {
    try {
      const beforeSweep = await sweepTransitionCandidates(db);
      summary.db = await dataOrThrow(await db.rpc("order_sweep_db", {})) || {};
      summary.errors += summary.db.errors || 0;
      await publishSweepTransitions(db, beforeSweep);
    } catch (error) {
      summary.errors++;
      log(`Database sweep failed: ${error.message}`);
    }
  }

  let due = [];
  try {
    due = await dataOrThrow(await db.rpc("mkt_payout_due", { p_limit: 50 })) || [];
  } catch (error) {
    summary.errors++;
    log(`Payout query failed: ${error.message}`);
  }

  for (const order of due) {
    try {
      if (order.refunded_cents > 0) {
        summary.skippedRefunded++;
        if (apply) await notifyAdmin(`Transfer skipped for refunded order ${order.id}`);
        continue;
      }
      if (!apply) {
        summary.transferred++;
        continue;
      }
      const { data: seller, error } = await db
        .from("seller_accounts")
        .select("stripe_account_id")
        .eq("user_id", order.seller_id)
        .single();
      if (error) throw error;
      const transfer = await stripe.transfers.create({
        amount: order.seller_net_cents,
        currency: "usd",
        destination: seller.stripe_account_id,
        source_transaction: order.stripe_charge_id,
        transfer_group: order.id,
        metadata: { order_id: order.id },
      }, { idempotencyKey: `transfer-${order.id}` });
      await dataOrThrow(await db.rpc("order_mark_transferred", {
        p_order: order.id,
        p_transfer_id: transfer.id,
        p_stripe_event_id: null,
      }));
      summary.transferred++;
    } catch (error) {
      summary.errors++;
      log(`Order ${order.id} transfer failed: ${error.message}`);
    }
  }

  const mode = apply ? "applied" : "dry run";
  log(
    `Marketplace sweep: ${mode}; expired ${summary.expired}; transferred ${summary.transferred}; `
    + `refunded skipped ${summary.skippedRefunded}; errors ${summary.errors}.`,
  );
  return summary;
}
