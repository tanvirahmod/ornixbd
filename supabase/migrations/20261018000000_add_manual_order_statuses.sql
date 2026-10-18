-- Allow manual orders to record verified mobile payments and booking status.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'bkash_nagad_paid', 'booked', 'delivered', 'canceled'));
