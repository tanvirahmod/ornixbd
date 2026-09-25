/*
  3-step checkout support
  1. orders: pricing + payment columns for the new checkout flow
     (subtotal, delivery_fee, discount_amount, total_amount, coupon_code,
      payment_method, advance_amount, due_amount, courier_name)
     All nullable + defaulted so old rows and older clients keep working.
  2. coupons: store discount codes applied at checkout
     - product_codes: optional list of product codes the coupon is limited to
*/

-- ── orders: pricing columns ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'subtotal'
  ) THEN
    ALTER TABLE orders ADD COLUMN subtotal numeric(10,2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_fee'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivery_fee numeric(10,2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE orders ADD COLUMN discount_amount numeric(10,2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'total_amount'
  ) THEN
    ALTER TABLE orders ADD COLUMN total_amount numeric(10,2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'coupon_code'
  ) THEN
    ALTER TABLE orders ADD COLUMN coupon_code text;
  END IF;
END $$;

-- ── orders: payment columns ──
-- payment_method: 'advance_partial' (delivery fee now, rest COD) | 'full_advance' (everything now)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_method text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'advance_amount'
  ) THEN
    ALTER TABLE orders ADD COLUMN advance_amount numeric(10,2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'due_amount'
  ) THEN
    ALTER TABLE orders ADD COLUMN due_amount numeric(10,2);
  END IF;
END $$;

-- courier_name: 'Home Delivery' or 'Store Pickup' (swap in the courier name once the API is wired)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'courier_name'
  ) THEN
    ALTER TABLE orders ADD COLUMN courier_name text;
  END IF;
END $$;

-- ── coupons table ──
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  value numeric(10,2) NOT NULL DEFAULT 0,
  min_order_amount numeric(10,2),
  max_uses integer,
  times_used integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  product_codes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_coupons" ON coupons;
CREATE POLICY "anon_select_coupons" ON coupons FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_coupons" ON coupons;
CREATE POLICY "anon_insert_coupons" ON coupons FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_coupons" ON coupons;
CREATE POLICY "anon_update_coupons" ON coupons FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_coupons" ON coupons;
CREATE POLICY "anon_delete_coupons" ON coupons FOR DELETE TO anon, authenticated USING (true);
/*
  Product-specific coupons
  - coupons.product_codes: text array of product codes (e.g. '{PRD-1001,PRD-1002}').
    Empty array = coupon applies to all products.
  Run AFTER 20260924000000_add_checkout_fields_and_coupons.sql.
  (Skips itself if the column already exists.)
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'coupons'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'product_codes'
  ) THEN
    ALTER TABLE coupons ADD COLUMN product_codes text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
-- Per-product "no advance payment" flag.
-- When advance_optional = true, checkout for this product skips the bKash
-- number / TrxID step entirely: the customer pays the full amount in cash
-- on delivery (or at store pickup).

alter table public.products
  add column if not exists advance_optional boolean not null default false;

comment on column public.products.advance_optional is
  'When true, this product can be ordered without any bKash advance — full cash on delivery.';

-- Existing products keep the current behaviour (advance required), which the
-- default false already provides. No data backfill needed.
-- Per-category visibility flag.
-- When is_hidden = true, the category disappears from all storefront surfaces
-- (navbar dropdown, home page top categories, shop page filter, shop-by-size
-- page) but keeps working via direct collection links and stays fully editable
-- in the admin panel.

alter table public.categories
  add column if not exists is_hidden boolean not null default false;

comment on column public.categories.is_hidden is
  'When true, this category is hidden from the storefront (navbar, home, shop filters). Direct collection links still work.';
-- Steadfast courier integration: store the booking + tracking info on each order.
alter table public.orders
  add column if not exists tracking_code text;
-- Store the customer's delivery zone (drives the Steadfast courier charge)
-- so bookings use the right rate: dhaka_city / dhaka_suburban / outside_dhaka.
alter table public.orders
  add column if not exists delivery_zone text;
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

-- ============ done ============