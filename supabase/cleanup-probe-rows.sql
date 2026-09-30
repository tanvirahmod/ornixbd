-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP after insert-block fix (run once in Supabase SQL Editor):
--   1. Deletes the two probe rows created while verifying the RPC insert path
--      (order RPC-PROBE-354314 "RPC Probe" + one feedback row from
--      probe@example.com). Deleting them HERE — not in the admin panel — keeps
--      stock counts untouched (they never decremented stock).
--   2. Drops debug_rls_state() — diagnostic only, served its purpose, and it
--      is anon-executable so it shouldn't linger.
-- The insert_order_rpc / insert_feedback_rpc functions are KEPT — they are the
-- website's fallback insert path.
-- Safe to re-run (no-op when the rows are already gone).
-- ─────────────────────────────────────────────────────────────────────────────

delete from public.orders
where customer_name = 'RLS Probe'
   or order_code like 'RPC-PROBE-%'
   or order_code like 'PROBE-%'
   or order_code like 'RLS-PROBE-%';

delete from public.feedback
where email = 'probe@example.com';

drop function if exists public.debug_rls_state();

-- Confirm: should return 0 rows for probes (the real test order ORN-TWCH stays
-- until you delete it from the admin panel):
select order_code, customer_name from public.orders
where order_code in ('ORN-TWCH') or customer_name in ('RPC Probe', 'RLS Probe');
