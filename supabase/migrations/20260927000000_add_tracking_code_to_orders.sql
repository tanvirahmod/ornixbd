-- Steadfast courier integration: store the booking + tracking info on each order.
alter table public.orders
  add column if not exists tracking_code text;
