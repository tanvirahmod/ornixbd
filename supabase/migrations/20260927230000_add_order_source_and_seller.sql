-- ─────────────────────────────────────────────────────────────────────────────
-- Manual (in-store) orders: mark where an order came from and who sold it.
-- Run once in Supabase SQL Editor — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 'checkout' (default) for website orders, 'manual' for walk-in purchases
-- recorded in Admin → Manual Orders.
alter table public.orders
  add column if not exists order_source text not null default 'checkout';

-- Staff member who recorded/sold a manual order (e.g. 'admin1' or a name).
alter table public.orders
  add column if not exists seller_name text;

comment on column public.orders.order_source is
  'Where the order came from: checkout (website) or manual (in-store purchase recorded by staff).';

comment on column public.orders.seller_name is
  'For manual orders: the staff member who made the sale.';

-- ============ done ============
