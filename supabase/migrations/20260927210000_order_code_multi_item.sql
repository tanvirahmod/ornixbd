-- ── Multi-item purchases share one order code ──
-- A cart checkout (or a manual sale with several products) inserts one row per
-- item, all carrying the same order_code. The unique index created when order
-- codes were introduced would reject the second row with a duplicate-key
-- error, so it becomes a plain (non-unique) lookup index — order-code lookups
-- on the track-order page and admin stay just as fast.

drop index if exists public.orders_order_code_key;

create index if not exists orders_order_code_idx on public.orders (order_code);

comment on index public.orders_order_code_idx is
  'Non-unique by design: several order rows (one multi-item purchase) intentionally share a single order_code.';
