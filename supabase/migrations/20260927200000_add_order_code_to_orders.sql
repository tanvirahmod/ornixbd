-- Customer-facing order tracking.
-- order_code: short human-friendly code shown to the customer at checkout
-- (e.g. ORN-7K3M9Q). Backfilled for existing orders from their UUID suffix.
alter table public.orders
  add column if not exists order_code text;

-- Backfill: ORN- + first 6 chars of the UUID, uppercased
update public.orders
set order_code = 'ORN-' || upper(substring(id::text from 1 for 6))
where order_code is null;

-- Make it unique (collisions beyond 6 chars are astronomically unlikely,
-- but the constraint keeps inserts safe)
create unique index if not exists orders_order_code_key on public.orders (order_code);

-- Future orders get a code automatically if the app doesn't send one
alter table public.orders
  alter column order_code set default 'ORN-' || upper(substring(gen_random_uuid()::text from 1 for 6));
