-- Store the customer's delivery zone (drives the Steadfast courier charge)
-- so bookings use the right rate: dhaka_city / dhaka_suburban / outside_dhaka.
alter table public.orders
  add column if not exists delivery_zone text;
