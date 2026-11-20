-- 0108_beta_platform_fee.sql
--
-- Beta marketplace fee: 5% of each Buy now order (item price plus shipping),
-- kept by ComixCatalog. Tony 2026-11-20.
--
-- Orders use separate charges and transfers: the buyer pays the platform,
-- and scripts/lib/marketplaceSweep.js later transfers seller_net_cents to the
-- seller. The order functions (mkt_create_order and the multi-copy version in
-- 0085) read platform_fee_bps from this config when an order is created and
-- store it on the row, so the new rate applies only to orders created after
-- this runs. Existing orders keep the fee they were created with.
--
-- Only platform_fee_bps changes. Keep FEE_CONFIG in src/lib/orders.js equal
-- to this object (src/lib/orders.test.js checks it).

create or replace function public.mkt_fee_config() returns jsonb language sql immutable security definer set search_path=public as $$
 select '{"platform_fee_bps":500,"processing_fee_bps":290,"processing_fee_fixed_cents":30,"reservation_minutes":35,"auto_deliver_days":14,"complete_after_delivery_days":3,"tracking_required_cents":5000,"ship_to_retention_days":120}'::jsonb
$$;
