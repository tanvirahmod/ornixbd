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

-- NOTE: this section originally created a UNIQUE index on order_code, but
-- multi-item cart orders (added later in this same file) insert one row per
-- line item sharing the same code — so order_code is intentionally NOT unique.
-- Replay-safe version: create the plain lookup index here; the unique index
-- is never recreated, and the later section keeps the plain index too.
create index if not exists orders_order_code_idx on public.orders (order_code);

-- Future orders get a code automatically if the app doesn't send one
alter table public.orders
  alter column order_code set default 'ORN-' || upper(substring(gen_random_uuid()::text from 1 for 6));

-- ============ done ============
-- ============ next batch: admin expansion (profit tracking, stock history, activity log) ============
-- Same content as supabase/migrations/20260927220000_admin_expansion_profit_stock_logs.sql

-- Cost price per product — powers margin + net profit on the Finance tab
alter table public.products
  add column if not exists cost_price numeric(10, 2);

comment on column public.products.cost_price is
  'What the product costs the merchant (supplier price). Powers margin and net-profit reporting. NULL = unknown.';

-- Business expenses — ads, packaging, rent, courier top-ups…
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  note text,
  spent_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

drop policy if exists "expenses fully accessible" on public.expenses;
create policy "expenses fully accessible"
  on public.expenses for all to anon, authenticated
  using (true) with check (true);

comment on table public.expenses is
  'Business expenses entered in the admin Finance tab; subtracted from gross profit for net profit.';

-- Stock movement history — every stock change with a reason
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,
  delta integer not null,
  reason text not null,
  note text,
  admin_id text,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);

alter table public.stock_movements enable row level security;

drop policy if exists "stock movements fully accessible" on public.stock_movements;
create policy "stock movements fully accessible"
  on public.stock_movements for all to anon, authenticated
  using (true) with check (true);

comment on column public.stock_movements.delta is
  'Signed change in units: negative = stock left (customer order, manual sell, correction), positive = stock added (restock).';

comment on column public.stock_movements.reason is
  'Why stock changed: order / manual_sell / restock / cancel_restore / adjustment.';

-- Admin activity log — which admin did what
create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists admin_log_created_idx
  on public.admin_log (created_at desc);

alter table public.admin_log enable row level security;

drop policy if exists "admin log fully accessible" on public.admin_log;
create policy "admin log fully accessible"
  on public.admin_log for all to anon, authenticated
  using (true) with check (true);

comment on table public.admin_log is
  'Audit trail of admin actions: status changes, Steadfast bookings, deletions, product edits, restocks.';

-- ============ next batch: manual (in-store) orders ============
-- Same content as supabase/migrations/20260927230000_add_order_source_and_seller.sql

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

-- ============ next batch: saved sellers (manual orders dropdown) ============
-- Same content as supabase/migrations/20260928000000_add_sellers_table.sql

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.sellers enable row level security;

drop policy if exists "sellers fully accessible" on public.sellers;
create policy "sellers fully accessible"
  on public.sellers for all to anon, authenticated
  using (true) with check (true);

comment on table public.sellers is
  'Saved seller names for the Manual Orders dropdown; admins can delete entries.';

-- Backfill: every seller already recorded on an order becomes a saved name
insert into public.sellers (name)
select distinct trim(seller_name)
from public.orders
where seller_name is not null and trim(seller_name) <> ''
on conflict (name) do nothing;
-- ─────────────────────────────────────────────────────────────────────────────
-- Per-product size charts (measurement tables) with reusable templates.
--
-- Many products share identical measurements, so charts live in their own
-- table and products reference one by id. Editing a template updates every
-- product that uses it. A product with no reference simply shows no chart.
--
-- size_chart_templates.measurements shape (JSONB, rows × sizes):
--   {
--     "rows":   ["Chest", "Length"],
--     "sizes":  ["S", "M", "L", "XL"],
--     "values": { "Chest":  { "S": "40", "M": "42", "L": "44", "XL": "46" },
--                 "Length": { "S": "27", "M": "28", "L": "28.5", "XL": "29" } },
--     "note":   "Measurements in inches · fit: relaxed"   -- optional
--   }
-- Values are free text so admins can write "40 in", "28.5", "—", etc.
-- Run once in Supabase SQL Editor — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.size_chart_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  measurements jsonb not null default '{"rows":[],"sizes":[],"values":{}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.size_chart_templates enable row level security;

drop policy if exists "size_chart_templates fully accessible" on public.size_chart_templates;
create policy "size_chart_templates fully accessible"
  on public.size_chart_templates for all to anon, authenticated
  using (true) with check (true);

comment on table public.size_chart_templates is
  'Reusable measurement charts (rows × sizes JSONB) referenced by products.';

-- products: link to a chart template (nullable = no chart shown)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'size_chart_template_id'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN size_chart_template_id uuid REFERENCES public.size_chart_templates(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- ============ done ============
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY LOCKDOWN + ADMIN AUTH
--
-- Before this migration every table was writable by the anonymous (public)
-- role — the admin login in the app was decorative. This migration:
--   1. Adds public.admin_users — the allowlist of Supabase Auth users who
--      are admins. Create one real user per admin in Supabase Auth
--      (Dashboard → Authentication → Users → Add user), then insert their
--      email here. `is_admin()` (SECURITY DEFINER) checks membership.
--   2. Replaces the wide-open per-table policies with the least surface the
--      storefront needs, and full access for admins:
--        • products / product_images / categories / product_sizes /
--          size_chart_templates / announcements: public SELECT only
--        • site_settings: public SELECT (checkout reads rates + bKash number)
--        • coupons: public SELECT restricted to active, non-expired rows
--          (checkout validates codes client-side today)
--        • orders: public INSERT only (checkout) + track_order(order_code,
--          phone_last4) RPC returning the minimal columns the tracking page
--          shows; no public SELECT/UPDATE/DELETE
--        • feedback: public INSERT only (contact form); admin reads the rest
--        • everything else (expenses, stock_movements, admin_log, sellers,
--          admin_log): admin only
--   3. Adds checkout RPCs so customers can decrement stock and consume a
--      coupon without holding UPDATE rights on those tables:
--        • checkout_decrement_stock(items jsonb)
--        • checkout_consume_coupon(code text)
--   4. Locks down the realtime publication to the storefront tables.
--
-- IDEMPOTENT — safe to re-run.
-- ⚠️ Run this AFTER creating your admin users in Supabase Auth, then insert
--    their emails into public.admin_users (example in the comment below).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Admin allowlist + helper ──
create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "admin_users readable by admins" on public.admin_users;
create policy "admin_users readable by admins"
  on public.admin_users for select to authenticated
  using (exists (select 1 from public.admin_users a where a.email = auth.jwt() ->> 'email'));

-- SECURITY DEFINER so policies can check admin status without recursive RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.admin_users
       where email = (auth.jwt() ->> 'email')
     );
$$;

-- ── 2) Minimal public RPCs ──

-- Order tracking RPC: originally defined here with `limit 1` and a narrower
-- return type. SUPERSEDED further below in this file (multi-line tracking +
-- address/zone columns) — the later definition is the live one, so nothing is
-- created here anymore (avoids 42P13 return-type conflicts on replay).

-- Stock decrement RPC: originally defined here with `returns void` and silent
-- zero-flooring. SUPERSEDED further below in this file (all-or-nothing guard
-- returning a shortage report as jsonb) — the later definition is the live
-- one, so nothing is created here anymore (avoids 42P13 on replay).

-- Checkout: consume one coupon use (counter increment) without exposing
-- coupons for public UPDATE.
create or replace function public.checkout_consume_coupon(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coupons
     set times_used = coalesce(times_used, 0) + 1
   where upper(code) = upper(p_code);
$$;

grant execute on function public.track_order(text, text) to anon, authenticated;
grant execute on function public.checkout_decrement_stock(jsonb) to anon, authenticated;
grant execute on function public.checkout_consume_coupon(text) to anon, authenticated;

-- ── 3) Policies ──

-- products
drop policy if exists "anon_select_products" on products;
drop policy if exists "anon_insert_products" on products;
drop policy if exists "anon_update_products" on products;
drop policy if exists "anon_delete_products" on products;
drop policy if exists "public_read_products" on public.products;
create policy "public_read_products" on products for select to anon, authenticated using (true);
drop policy if exists "admin_all_products" on public.products;
create policy "admin_all_products" on products for all to authenticated using (is_admin()) with check (is_admin());

-- product_images
drop policy if exists "anon_select_product_images" on product_images;
drop policy if exists "anon_insert_product_images" on product_images;
drop policy if exists "anon_update_product_images" on product_images;
drop policy if exists "anon_delete_product_images" on product_images;
drop policy if exists "public_read_product_images" on public.product_images;
create policy "public_read_product_images" on product_images for select to anon, authenticated using (true);
drop policy if exists "admin_all_product_images" on public.product_images;
create policy "admin_all_product_images" on product_images for all to authenticated using (is_admin()) with check (is_admin());

-- product_sizes
drop policy if exists "Allow public read product_sizes" on product_sizes;
drop policy if exists "Allow public insert product_sizes" on product_sizes;
drop policy if exists "Allow public update product_sizes" on product_sizes;
drop policy if exists "Allow public delete product_sizes" on product_sizes;
drop policy if exists "public_read_product_sizes" on public.product_sizes;
create policy "public_read_product_sizes" on product_sizes for select to anon, authenticated using (true);
drop policy if exists "admin_all_product_sizes" on public.product_sizes;
create policy "admin_all_product_sizes" on product_sizes for all to authenticated using (is_admin()) with check (is_admin());

-- categories
drop policy if exists "anon_select_categories" on categories;
drop policy if exists "anon_insert_categories" on categories;
drop policy if exists "anon_update_categories" on categories;
drop policy if exists "anon_delete_categories" on categories;
drop policy if exists "public_read_categories" on public.categories;
create policy "public_read_categories" on categories for select to anon, authenticated using (true);
drop policy if exists "admin_all_categories" on public.categories;
create policy "admin_all_categories" on categories for all to authenticated using (is_admin()) with check (is_admin());

-- size_chart_templates (created before policies existed for it)
drop policy if exists "size_chart_templates fully accessible" on size_chart_templates;
drop policy if exists "public_read_size_charts" on public.size_chart_templates;
create policy "public_read_size_charts" on size_chart_templates for select to anon, authenticated using (true);
drop policy if exists "admin_all_size_charts" on public.size_chart_templates;
create policy "admin_all_size_charts" on size_chart_templates for all to authenticated using (is_admin()) with check (is_admin());

-- announcements
drop policy if exists "anon_select_announcements" on announcements;
drop policy if exists "anon_all_announcements" on announcements;
drop policy if exists "public_read_active_announcements" on public.announcements;
create policy "public_read_active_announcements" on announcements for select to anon, authenticated using (is_active = true);
drop policy if exists "admin_all_announcements" on public.announcements;
create policy "admin_all_announcements" on announcements for all to authenticated using (is_admin()) with check (is_admin());

-- site_settings (checkout reads courier rates + bKash number)
drop policy if exists "anon_select_site_settings" on site_settings;
drop policy if exists "anon_all_site_settings" on site_settings;
drop policy if exists "public_read_site_settings" on public.site_settings;
create policy "public_read_site_settings" on site_settings for select to anon, authenticated using (true);
drop policy if exists "admin_all_site_settings" on public.site_settings;
create policy "admin_all_site_settings" on site_settings for all to authenticated using (is_admin()) with check (is_admin());

-- coupons: checkout validates codes client-side; only active/unexpired are visible
drop policy if exists "anon_select_coupons" on coupons;
drop policy if exists "anon_insert_coupons" on coupons;
drop policy if exists "anon_update_coupons" on coupons;
drop policy if exists "anon_delete_coupons" on coupons;
drop policy if exists "public_read_active_coupons" on public.coupons;
create policy "public_read_active_coupons" on coupons for select to anon, authenticated
  using (is_active = true and (expires_at is null or expires_at > now()));
drop policy if exists "admin_all_coupons" on public.coupons;
create policy "admin_all_coupons" on coupons for all to authenticated using (is_admin()) with check (is_admin());

-- orders: public can create (checkout) — everything else is admin-only or via RPC
drop policy if exists "anon_select_orders" on orders;
drop policy if exists "anon_insert_orders" on orders;
drop policy if exists "anon_update_orders" on orders;
drop policy if exists "anon_delete_orders" on orders;
drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders" on orders for insert to anon, authenticated with check (true);
drop policy if exists "admin_all_orders" on public.orders;
create policy "admin_all_orders" on orders for all to authenticated using (is_admin()) with check (is_admin());

-- feedback: public contact form submits; reading/managing is admin-only
drop policy if exists "anon_select_feedback" on feedback;
drop policy if exists "anon_insert_feedback" on feedback;
drop policy if exists "anon_update_feedback" on feedback;
drop policy if exists "anon_delete_feedback" on feedback;
drop policy if exists "public_insert_feedback" on public.feedback;
create policy "public_insert_feedback" on feedback for insert to anon, authenticated with check (true);
drop policy if exists "admin_all_feedback" on public.feedback;
create policy "admin_all_feedback" on feedback for all to authenticated using (is_admin()) with check (is_admin());

-- expenses / stock_movements / admin_log / sellers — admin only
drop policy if exists "expenses fully accessible" on expenses;
drop policy if exists "admin_all_expenses" on public.expenses;
create policy "admin_all_expenses" on expenses for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "stock movements fully accessible" on stock_movements;
drop policy if exists "admin_all_stock_movements" on public.stock_movements;
create policy "admin_all_stock_movements" on stock_movements for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin log fully accessible" on admin_log;
drop policy if exists "admin_all_admin_log" on public.admin_log;
create policy "admin_all_admin_log" on admin_log for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "sellers fully accessible" on sellers;
drop policy if exists "admin_all_sellers" on public.sellers;
create policy "admin_all_sellers" on sellers for all to authenticated using (is_admin()) with check (is_admin());

-- admin_users: governed by the allowlist policy created above

-- ── 4) Realtime: exactly the tables the app subscribes to ──
-- (announcements/categories on the storefront, orders/feedback in admin,
--  products + product_sizes for stock sync. Idempotent via exception traps.)
do $$
declare
  t text;
  tables text[] := array['products', 'product_sizes', 'categories', 'announcements', 'orders', 'feedback'];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime drop table public.%I', t);
    exception when undefined_object then null; -- not in the publication yet
    end;
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; -- already added (re-run)
    end;
  end loop;
end $$;

-- ============ done ============

-- ============ next batch: multi-item sales share one order code ============
-- Same content as supabase/migrations/20260927210000_order_code_multi_item.sql

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

-- ============ next batch: Nagad second payment channel ============
-- Same content as supabase/migrations/20260928010000_add_payment_channel.sql

-- ── Nagad as a second advance-payment channel at checkout ──
-- payment_channel records which mobile wallet the customer sent the advance
-- through ('bkash' | 'nagad'). The bKash/Nagad numbers themselves live in
-- site_settings (checkout_bkash_number / checkout_nagad_number) — no SQL
-- needed for those; set them in Admin → Settings.
-- Safe to re-run; the app keeps working even if this migration is pending
-- (checkout falls back to the pre-channel payload automatically).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_channel'
  ) THEN
    alter table public.orders add column payment_channel text;
    comment on column public.orders.payment_channel is
      'Mobile wallet the customer used for the advance: bkash or nagad. NULL = bKash (pre-Nagad orders) or no advance required.';
  END IF;
END $$;

-- ============ next batch: super admin + per-admin permissions ============
-- Same content as supabase/migrations/20261001000000_super_admin_permissions.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Super admin + per-admin capability permissions
--   1. admin_users.role: 'super_admin' | 'admin' (default 'admin').
--      admin1@ornix.com.bd is seeded as the super admin (idempotent).
--   2. admin_users.permissions: jsonb map of capability → boolean, e.g.
--      {"settings": false}. Missing key = allowed (true) by default;
--      a super admin always has every capability regardless of the map.
--      Capabilities mirror the admin tabs: products, stock, categories,
--      orders, manual, finance, coupons, feedback, settings, team.
--   3. is_super_admin() + admin_has(cap) SECURITY DEFINER helpers.
--   4. RLS policies rewritten: 'settings'-gated tables (site_settings write,
--      expenses, admin_log, announcements write) check admin_has('settings');
--      all other admin policies check is_admin() as before (allowlist alone
--      still grants baseline access; per-tab hiding is a UI concern).
--   5. admin_user management RPCs: only super admins may insert/delete rows
--      in admin_users (via service-side helpers; RLS on admin_users itself
--      stays read-only for admins, managed by super admin RPCs).
-- IDEMPOTENT — safe to re-run. Run AFTER admin users exist in Supabase Auth.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Role + permissions columns ──
alter table public.admin_users add column if not exists role text not null default 'admin';
alter table public.admin_users add column if not exists permissions jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admin_users_role_check') then
    alter table public.admin_users add constraint admin_users_role_check
      check (role in ('super_admin', 'admin')) not valid;
  end if;
end $$;
alter table public.admin_users validate constraint admin_users_role_check;

comment on column public.admin_users.role is
  'super_admin manages the team and bypasses capability checks; admin has baseline access minus disabled capabilities.';
comment on column public.admin_users.permissions is
  'jsonb map capability→boolean. Missing key = allowed. Capabilities: products, stock, categories, orders, manual, finance, coupons, feedback, settings, team.';

-- Seed the super admin (row must match the Supabase Auth user email)
insert into public.admin_users (email, role)
values ('admin1@ornix.com.bd', 'super_admin')
on conflict (email) do update set role = 'super_admin';

-- ── 2) Helpers ──
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.admin_users
       where email = (auth.jwt() ->> 'email')
         and role = 'super_admin'
     );
$$;

create or replace function public.admin_has(p_capability text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when auth.uid() is null then false
    when public.is_super_admin() then true
    when not exists (
      select 1 from public.admin_users
      where email = (auth.jwt() ->> 'email')
    ) then false  -- not on the allowlist → no admin capabilities at all
    else coalesce((
      select (permissions ->> p_capability)::boolean
      from public.admin_users
      where email = (auth.jwt() ->> 'email')
    ), true)  -- allowlisted, capability key unset → allowed by default
  end;
$$;

-- ── 3) Team management RPCs (super admin only) ──
create or replace function public.super_admin_add_admin(p_email text, p_role text default 'admin')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can manage admins.';
  end if;
  if p_role not in ('super_admin', 'admin') then
    raise exception 'Role must be super_admin or admin.';
  end if;
  insert into public.admin_users (email, role) values (lower(trim(p_email)), p_role)
  on conflict (email) do update set role = excluded.role;
end;
$$;

create or replace function public.super_admin_remove_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can manage admins.';
  end if;
  if lower(trim(p_email)) = (auth.jwt() ->> 'email') then
    raise exception 'You cannot remove your own super admin account.';
  end if;
  delete from public.admin_users where email = lower(trim(p_email));
end;
$$;

create or replace function public.super_admin_set_permissions(p_email text, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the super admin can manage admins.';
  end if;
  if exists (select 1 from public.admin_users where email = lower(trim(p_email)) and role = 'super_admin')
     and lower(trim(p_email)) <> (auth.jwt() ->> 'email') then
    raise exception 'Another super admin''s capabilities cannot be changed.';
  end if;
  update public.admin_users set permissions = p_permissions where email = lower(trim(p_email));
end;
$$;

-- ── 4) Policy rewrites for capability-gated tables ──
-- (is_admin() still gates everything else; these tables additionally require
--  the 'settings' capability because they power the Settings tab.)

drop policy if exists "admin_all_site_settings" on site_settings;
drop policy if exists "settings_cap_site_settings" on public.site_settings;
create policy "settings_cap_site_settings" on site_settings for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

drop policy if exists "admin_all_announcements" on announcements;
drop policy if exists "settings_cap_announcements" on public.announcements;
create policy "settings_cap_announcements" on announcements for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

drop policy if exists "admin_all_expenses" on expenses;
drop policy if exists "settings_cap_expenses" on public.expenses;
create policy "settings_cap_expenses" on expenses for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

drop policy if exists "admin_all_admin_log" on admin_log;
drop policy if exists "settings_cap_admin_log" on public.admin_log;
create policy "settings_cap_admin_log" on admin_log for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

-- ── 5) admin_users itself: admins read the team list; only super admins
--       (via the RPCs above) change it. ──
drop policy if exists "super_admin_all_admin_users" on admin_users;
create policy "super_admin_all_admin_users" on admin_users for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ============ next batch: admin_me RPC + non-recursive admin_users read policy ============
-- Same content as supabase/migrations/20261002000000_admin_me_and_read_policy_fix.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: role loading for the admin panel
--   The original "admin_users readable by admins" policy checked membership
--   with a subquery on admin_users itself — Postgres detects that as infinite
--   recursion and errors every app-side SELECT on the table, so the panel
--   could never read the signed-in admin's role (super admin pill hidden).
--   1. Replace the recursive policy with one built on is_admin(), which is
--      SECURITY DEFINER and therefore cannot recurse.
--   2. Add public.admin_me() — SECURITY DEFINER RPC returning the caller's own
--      role + permissions without depending on admin_users RLS at all.
-- IDEMPOTENT — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Non-recursive read policy ──
drop policy if exists "admin_users readable by admins" on public.admin_users;
create policy "admin_users readable by admins"
  on public.admin_users for select to authenticated
  using (public.is_admin());

-- Writes stay super-admin-only (from the team migration; idempotent re-create)
drop policy if exists "super_admin_all_admin_users" on public.admin_users;
create policy "super_admin_all_admin_users" on public.admin_users for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── 2) Who am I? — role + permissions for the signed-in admin ──
create or replace function public.admin_me()
returns table (role text, permissions jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select a.role, a.permissions
  from public.admin_users a
  where a.email = (auth.jwt() ->> 'email');
$$;

grant execute on function public.admin_me() to authenticated;

-- Full team list for the super admin's Team sub-tab (empty set for anyone else)
create or replace function public.super_admin_list_admins()
returns table (email text, role text, permissions jsonb)
language sql
security definer
set search_path = public
stable
as $$
  select a.email, a.role, a.permissions
  from public.admin_users a
  where public.is_super_admin()
  order by a.email;
$$;

grant execute on function public.super_admin_list_admins() to authenticated;

-- ============ next batch: admin activity logging for every admin ============
-- Same content as supabase/migrations/20261003000000_admin_log_rpc.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Activity logging that works for every admin
--   Problem: direct INSERTs into admin_log were gated by admin_has('settings'),
--   so an admin whose Settings capability was disabled could never write their
--   activity rows (the failure was silent) — the super admin saw only their
--   own log.
--   Fix:
--     1. log_admin_activity() — SECURITY DEFINER RPC any allowlisted admin can
--        call; it forces admin_id to the caller's own email, so nobody can
--        forge someone else's trail.
--     2. A dedicated INSERT policy so self-attributed logging never depends on
--        the 'settings' capability (reads still require it).
-- IDEMPOTENT — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.log_admin_activity(p_action text, p_target text default null, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'Sign in to record activity.';
  end if;
  if not exists (select 1 from public.admin_users where email = v_email) then
    raise exception 'Only allowlisted admins can record activity.';
  end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (v_email, p_action, p_target, p_detail);
end;
$$;

grant execute on function public.log_admin_activity(text, text, text) to authenticated;

-- INSERT policy: allowlisted admins may log their own activity regardless of
-- the 'settings' capability (SELECT/UPDATE/DELETE stay settings-gated).
drop policy if exists "admins_insert_own_admin_log" on public.admin_log;
create policy "admins_insert_own_admin_log" on public.admin_log
  for insert to authenticated
  with check (
    public.is_admin()
    and admin_id = (auth.jwt() ->> 'email')
  );



-- ============ batch: stock guard + coupon redemption + multi-line tracking ============
-- Source: supabase/migrations/20260928120000_stock_guard_and_coupon_rpc.sql (updated)
-- ── Stock guard + server-side coupon redemption + multi-line tracking ──────
-- 0) track_order now returns EVERY order row sharing the code (a cart checkout
--    inserts one row per item), plus customer_address/delivery_zone the
--    tracking page displays. The old `limit 1` made the page show only the
--    first item of a multi-item purchase.
--    Return type changes → drop the old version first (42P13 on replay otherwise).
drop function if exists public.track_order(text, text);
drop function if exists public.track_order(text);
create or replace function public.track_order(p_order_code text, p_phone_last4 text default null)
returns table (
  order_code text,
  status text,
  courier_name text,
  tracking_code text,
  created_at timestamptz,
  product_title text,
  selected_size text,
  quantity integer,
  total_amount numeric,
  due_amount numeric,
  customer_phone text,
  customer_address text,
  delivery_zone text
)
language sql
security definer
set search_path = public
stable
as $$
  select o.order_code, o.status::text, o.courier_name, o.tracking_code,
         o.created_at, o.product_title, o.selected_size,
         o.quantity, o.total_amount, o.due_amount,
         case
           when p_phone_last4 is null then null  -- no phone supplied → don't leak it
           when right(regexp_replace(o.customer_phone, '[^0-9]', '', 'g'), 4) = right(p_phone_last4, 4)
             then o.customer_phone
           else null
         end as customer_phone,
         o.customer_address,
         o.delivery_zone
  from public.orders o
  where o.order_code = p_order_code
  order by o.created_at asc;
$$;

-- DROP FUNCTION removed the old grants — restore public execute access.
grant execute on function public.track_order(text, text) to anon, authenticated;

-- 1) checkout_decrement_stock is now ALL-OR-NOTHING: it locks every product
--    row, verifies availability of every line first, and only then decrements.
--    A customer ordering 5 units with 1 in stock gets a shortage report instead
--    of a silently floored stock. Returns a jsonb array of unfulfilled lines:
--      [{ "product_id": "…", "size": "L" | null, "requested": 5,
--         "available": 1 }, …]  — empty array = all lines were fulfilled.
--    FOR UPDATE on the product rows serializes concurrent checkouts, so two
--    simultaneous buyers of the last unit can never both pass the check.
-- 2) checkout_redeem_coupon(p_code, p_subtotal, p_product_codes, p_commit)
--    validates a coupon SERVER-SIDE (active, not expired, min order, usage
--    limit, product restriction). With p_commit = false it only validates and
--    returns the would-be discount (the "apply coupon" step). With
--    p_commit = true it also bumps times_used atomically — the single point
--    where a use is consumed (the final submit).
--    Returns jsonb:
--      { "ok": true,  "code": "…", "discount_type": "percent|fixed",
--        "value": 10, "discount": 123.00 }
--      { "ok": false, "error": "invalid|expired|min_order|usage_limit|products",
--        "min_order_amount": 500, "product_codes": ["PRD-…"] }  (per error)
-- 3) checkout_restore_coupon(p_code) gives back one use when the order that
--    consumed it failed to save (all-or-nothing checkout).
--    checkout_restore_stock(p_items) gives reserved stock back for the same
--    reason.
-- 4) coupons is no longer publicly readable — codes can't be enumerated and
--    validation can't be bypassed client-side. The admin panel keeps full
--    access via is_admin().

-- ── 1) all-or-nothing stock decrement with shortage report ──
-- The lockdown migration's version returns void; CREATE OR REPLACE cannot
-- change a return type, so drop the old one first (nothing depends on it —
-- it is called by the app, not by policies or other functions).
drop function if exists public.checkout_decrement_stock(jsonb);

create or replace function public.checkout_decrement_stock(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  want integer;
  have integer;
  new_stock integer;
  shortages jsonb := '[]'::jsonb;
begin
  -- Phase 1: lock every product row (parent first, so multi-line carts always
  -- take locks in the same order — no deadlocks) and verify every line.
  for item in select * from jsonb_array_elements(p_items)
  loop
    want := greatest(1, coalesce((item ->> 'quantity')::int, 1));

    if item ->> 'size' is null or (item ->> 'size') = '' then
      select coalesce(stock_count, 0) into have
        from public.products
       where id = (item ->> 'product_id')::uuid
       for update;
      if have is null or have < want then
        shortages := shortages || jsonb_build_object(
          'product_id', item ->> 'product_id', 'size', null,
          'requested', want, 'available', coalesce(have, 0));
      end if;
    else
      perform 1 from public.products
       where id = (item ->> 'product_id')::uuid
       for update;
      select coalesce(quantity, 0) into have
        from public.product_sizes
       where product_id = (item ->> 'product_id')::uuid
         and size = item ->> 'size'
       for update;
      if have < want then
        shortages := shortages || jsonb_build_object(
          'product_id', item ->> 'product_id', 'size', item ->> 'size',
          'requested', want, 'available', have);
      end if;
    end if;
  end loop;

  -- Any shortage → change nothing at all (the caller reports and re-orders).
  if jsonb_array_length(shortages) > 0 then
    return shortages;
  end if;

  -- Phase 2: every line verified → apply all decrements.
  for item in select * from jsonb_array_elements(p_items)
  loop
    want := greatest(1, coalesce((item ->> 'quantity')::int, 1));

    if item ->> 'size' is null or (item ->> 'size') = '' then
      update public.products
         set stock_count = stock_count - want
       where id = (item ->> 'product_id')::uuid;
    else
      update public.product_sizes
         set quantity = quantity - want
       where product_id = (item ->> 'product_id')::uuid
         and size = item ->> 'size';
      -- keep the product-level total in sync with the size rows
      select coalesce(sum(quantity), 0) into new_stock
        from public.product_sizes
       where product_id = (item ->> 'product_id')::uuid;
      update public.products
         set stock_count = new_stock
       where id = (item ->> 'product_id')::uuid;
    end if;
  end loop;

  return '[]'::jsonb;
end;
$$;

-- ── 2) server-side coupon validation + atomic redemption ──
create or replace function public.checkout_redeem_coupon(
  p_code text,
  p_subtotal numeric,
  p_product_codes text[] default null,
  p_commit boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.coupons%rowtype;
  discount numeric;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into c from public.coupons where code = upper(btrim(p_code));
  if not found or c.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if c.max_uses is not null and c.times_used >= c.max_uses then
    return jsonb_build_object('ok', false, 'error', 'usage_limit');
  end if;
  if c.min_order_amount is not null and p_subtotal < c.min_order_amount then
    return jsonb_build_object('ok', false, 'error', 'min_order', 'min_order_amount', c.min_order_amount);
  end if;
  -- Product restriction: every ordered product code must be on the coupon's
  -- allowlist (the client sends the codes it is ordering).
  if c.product_codes is not null and array_length(c.product_codes, 1) > 0 then
    if p_product_codes is null or exists (
      select 1
        from unnest(c.product_codes) as allowed
       where upper(btrim(allowed)) <> all (select coalesce(upper(btrim(pc)), '') from unnest(p_product_codes) as pc)
    ) then
      return jsonb_build_object('ok', false, 'error', 'products', 'product_codes', c.product_codes);
    end if;
  end if;

  discount := case
    when c.discount_type = 'percent'
      then round(p_subtotal * least(greatest(c.value, 0), 100) / 100.0, 2)
    else least(greatest(c.value, 0), p_subtotal)
  end;

  -- Atomic: the WHERE clause makes the limit check and the increment one step,
  -- so two simultaneous checkouts can never both consume the last use.
  -- p_commit = false → validation only (the apply step reserves nothing).
  if p_commit then
    update public.coupons
       set times_used = times_used + 1
     where code = c.code
       and (max_uses is null or times_used < max_uses);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'usage_limit');
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'code', c.code, 'discount_type', c.discount_type,
    'value', c.value, 'discount', discount);
end;
$$;

-- ── 3) give back reserved resources when the order fails to save ──
create or replace function public.checkout_restore_coupon(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or btrim(p_code) = '' then
    return;
  end if;
  update public.coupons
     set times_used = greatest(0, times_used - 1)
   where code = upper(btrim(p_code))
     and times_used > 0;
end;
$$;

create or replace function public.checkout_restore_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  want integer;
  new_stock integer;
begin
  for item in select * from jsonb_array_elements(p_items)
  loop
    want := greatest(1, coalesce((item ->> 'quantity')::int, 1));
    if item ->> 'size' is null or (item ->> 'size') = '' then
      update public.products
         set stock_count = stock_count + want
       where id = (item ->> 'product_id')::uuid;
    else
      update public.product_sizes
         set quantity = quantity + want
       where product_id = (item ->> 'product_id')::uuid
         and size = item ->> 'size';
      select coalesce(sum(quantity), 0) into new_stock
        from public.product_sizes
       where product_id = (item ->> 'product_id')::uuid;
      update public.products
         set stock_count = new_stock
       where id = (item ->> 'product_id')::uuid;
    end if;
  end loop;
end;
$$;

grant execute on function public.checkout_decrement_stock(jsonb) to anon, authenticated;
grant execute on function public.checkout_redeem_coupon(text, numeric, text[], boolean) to anon, authenticated;
grant execute on function public.checkout_restore_coupon(text) to anon, authenticated;
grant execute on function public.checkout_restore_stock(jsonb) to anon, authenticated;

-- ── 4) coupons: no more public SELECT (codes stay private; validation is the RPC) ──
drop policy if exists "public_read_active_coupons" on public.coupons;
drop policy if exists "anon_select_coupons" on public.coupons;
-- (admin_all_coupons from the security lockdown stays: full access for admins)


-- ============ batch: feedback spam guard ============
-- Source: supabase/migrations/20260928130000_feedback_spam_guard.sql
-- ── Feedback spam guard ─────────────────────────────────────────────────────
-- The contact form's math captcha only runs in the browser — anyone with the
-- public anon key can POST to /rest/v1/feedback directly. Two server-side
-- defenses:
--   1) Honeypot: the form renders an invisible "website" field that humans
--      never fill. Bots that fill it are dropped SILENTLY (no error, so the
--      bot thinks it succeeded).
--   2) Per-IP rate limit: max 5 messages per hour per client IP. The IP comes
--      from the request header PostgREST exposes (request.headers GUC) and is
--      stored on the row so repeat offenders are counted across requests.
-- Plus sanity caps on lengths. The honeypot column is never stored with
-- content and the IP is never exposed to clients (only used server-side).

-- ── 1) new columns ──
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'website'
  ) then
    alter table public.feedback add column website text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'feedback' and column_name = 'client_ip'
  ) then
    alter table public.feedback add column client_ip text;
  end if;
end $$;

-- ── 2) guard trigger ──
create or replace function public.feedback_spam_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  forwarded text;
  recent_count integer;
begin
  -- Honeypot: anything that filled the invisible field is a bot. Drop silently.
  if new.website is not null and btrim(new.website) <> '' then
    return null;
  end if;

  -- Sanity: refuse absurd payloads.
  if length(coalesce(new.message, '')) > 2000 or length(coalesce(new.name, '')) > 100 then
    raise exception 'Message is too long.';
  end if;

  -- Client IP from the header PostgREST sets on Supabase (may be absent).
  forwarded := nullif(btrim(coalesce(
    current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''
  )), '');
  new.client_ip := nullif(btrim(split_part(coalesce(forwarded, ''), ',', 1)), '');

  -- Rate limit: 5 messages per hour per client IP. When the header was
  -- unavailable we can't attribute the request — allow it rather than
  -- blocking legitimate customers on unknown networks.
  if new.client_ip is not null then
    select count(*) into recent_count
      from public.feedback
     where created_at > now() - interval '1 hour'
       and client_ip = new.client_ip;
    if recent_count >= 5 then
      raise exception 'Too many messages — please try again later.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_spam_guard on public.feedback;
create trigger feedback_spam_guard
  before insert on public.feedback
  for each row execute function public.feedback_spam_guard();

-- ── 3) the IP must never be readable through the public SELECT-less table ──
-- feedback is INSERT-only for the public (security lockdown), so client_ip is
-- already unreachable for visitors; admins see it in the panel. Nothing else
-- to revoke.



-- ============ batch: detailed activity log + admin login/logout sessions ============
-- Same content as supabase/migrations/20261002000000_activity_log_detailed.sql
-- ── Richer activity log + admin login/logout session tracking ──────────────
--   1) admin_logins — one row per admin sign-in (logout_at set on sign-out),
--      powering the "Login sessions" panel in Settings → Activity.
--   2) log_admin_login() / log_admin_logout() — SECURITY DEFINER RPCs any
--      allowlisted admin can call; they stamp the caller's email, IP and
--      browser so the super admin sees WHERE each admin signed in from.
--   3) log_admin_activity() is unchanged — no admin_log schema change needed.
--   4) admin_log RLS stays as-is (admins read all via admin_all_admin_log;
--      self-insert policy "admins_insert_own_admin_log" already exists).
-- IDEMPOTENT — safe to re-run (all drops guarded, no data loss).

-- ── 1) admin_logins table ──
create table if not exists public.admin_logins (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  ip_address text,
  user_agent text
);

create index if not exists admin_logins_admin_idx on public.admin_logins (admin_id, login_at desc);
create index if not exists admin_logins_login_idx on public.admin_logins (login_at desc);

alter table public.admin_logins enable row level security;

drop policy if exists "admins read own admin_logins" on public.admin_logins;
drop policy if exists "admins read all admin_logins" on public.admin_logins;
create policy "admins read all admin_logins" on public.admin_logins
  for select to authenticated using (public.is_admin());

drop policy if exists "admins insert own admin_logins" on public.admin_logins;
create policy "admins insert own admin_logins" on public.admin_logins
  for insert to authenticated
  with check (public.is_admin() and admin_id = (auth.jwt() ->> 'email'));

drop policy if exists "admins update own admin_logins" on public.admin_logins;
create policy "admins update own admin_logins" on public.admin_logins
  for update to authenticated
  using (public.is_admin() and admin_id = (auth.jwt() ->> 'email'))
  with check (public.is_admin() and admin_id = (auth.jwt() ->> 'email'));

comment on table public.admin_logins is
  'One row per admin sign-in (logout_at set on sign-out). Powers the Login sessions panel.';

-- ── 2) login / logout RPCs ──
create or replace function public.log_admin_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_ip text;
  v_ua text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'Sign in to record login.';
  end if;
  if not exists (select 1 from public.admin_users where email = v_email) then
    raise exception 'Only allowlisted admins can record login.';
  end if;
  v_ip := nullif(trim(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '')), '');
  if v_ip like '%,%' then v_ip := split_part(v_ip, ',', 1); end if;
  v_ua := nullif(trim(coalesce(current_setting('request.headers', true)::json ->> 'user-agent', '')), '');
  insert into public.admin_logins (admin_id, login_at, ip_address, user_agent)
  values (v_email, now(), v_ip, v_ua);
end;
$$;

create or replace function public.log_admin_logout()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'Sign in to record logout.';
  end if;
  if not exists (select 1 from public.admin_users where email = v_email) then
    raise exception 'Only allowlisted admins can record logout.';
  end if;
  update public.admin_logins
     set logout_at = now()
   where admin_id = v_email
     and logout_at is null;
end;
$$;

grant execute on function public.log_admin_login() to authenticated;
grant execute on function public.log_admin_logout() to authenticated;

-- ══ manual-orders payment mode tag ══
-- Stores how the sale settled at the counter: 'full_payment' (everything
-- collected in store) or 'advance_paid' (delivery charge collected, product
-- rides COD). Nullable so website orders stay untouched. Guarded so re-running
-- the batch is always safe.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_mode'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_mode text;
  END IF;
END $$;

-- ══ admin stock RPCs + failed-login audit ══
-- 1) admin_decrement_stock(p_items jsonb) — atomic, row-locked decrements for
--    admin actions (in-store sales, stock sell). Unlike the checkout RPC there
--    is no all-or-nothing shortage report: the sale already physically
--    happened, so each line floors at 0 instead of failing (stock can never go
--    negative, and two admins selling the last unit can't both win). Sized
--    lines keep products.stock_count synced to the sum of the size rows.
-- 2) admin_restore_order_stock(p_order_ids uuid[]) — gives an order's quantity
--    back when it is canceled. Double-restore safe by caller contract: only
--    rows transitioning INTO 'canceled' are passed in.
-- 3) log_failed_login(p_email, p_detail) — records failed admin sign-ins.
--    The old direct insert could never work: the client isn't authenticated
--    yet, so admin-only RLS rejected it every time (dead code). The RPC is
--    SECURITY DEFINER but only records emails on the admin allowlist, with a
--    throttle so it can't be used to flood the log.
-- IDEMPOTENT — safe to re-run.

create or replace function public.admin_decrement_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  want integer;
  v_stock integer;
begin
  if auth.jwt() ->> 'email' is null then
    raise exception 'Sign in to adjust stock.';
  end if;
  if not exists (select 1 from public.admin_users where email = auth.jwt() ->> 'email') then
    raise exception 'Only allowlisted admins can adjust stock.';
  end if;
  for item in select * from jsonb_array_elements(p_items)
  loop
    want := greatest(1, coalesce((item ->> 'quantity')::int, 1));
    if item ->> 'size' is null or (item ->> 'size') = '' then
      update public.products
         set stock_count = greatest(coalesce(stock_count, 0) - want, 0)
       where id = (item ->> 'product_id')::uuid;
    else
      perform 1 from public.products
       where id = (item ->> 'product_id')::uuid
       for update;
      if found then
        update public.product_sizes
           set quantity = greatest(quantity - want, 0)
         where product_id = (item ->> 'product_id')::uuid
           and size = item ->> 'size';
        -- keep the product-level total in sync with the size rows
        select coalesce(sum(quantity), 0) into v_stock
          from public.product_sizes
         where product_id = (item ->> 'product_id')::uuid;
        update public.products
           set stock_count = v_stock
         where id = (item ->> 'product_id')::uuid;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.admin_restore_order_stock(p_order_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_stock integer;
begin
  if auth.jwt() ->> 'email' is null then
    raise exception 'Sign in to restore stock.';
  end if;
  if not exists (select 1 from public.admin_users where email = auth.jwt() ->> 'email') then
    raise exception 'Only allowlisted admins can restore stock.';
  end if;
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return;
  end if;
  for r in
    select o.product_id, o.selected_size, sum(greatest(coalesce(o.quantity, 0), 0)) as qty
      from public.orders o
     where o.id = any(p_order_ids)
       and o.product_id is not null
     group by o.product_id, o.selected_size
  loop
    if r.qty <= 0 then continue; end if;
    if r.selected_size is null or btrim(r.selected_size) = '' then
      select coalesce(stock_count, 0) into v_stock
        from public.products
       where id = r.product_id
       for update;
      if v_stock is not null then
        update public.products
           set stock_count = v_stock + r.qty
         where id = r.product_id;
      end if;
    else
      perform 1 from public.products
       where id = r.product_id
       for update;
      -- Skip silently when the size row is gone (legacy data) — there is no
      -- size row to attribute the units to, and product.total is sum-of-sizes.
      if found and exists (
        select 1 from public.product_sizes
         where product_id = r.product_id and size = r.selected_size
      ) then
        update public.product_sizes
           set quantity = quantity + r.qty
         where product_id = r.product_id
           and size = r.selected_size;
        select coalesce(sum(quantity), 0) into v_stock
          from public.product_sizes
         where product_id = r.product_id;
        update public.products
           set stock_count = v_stock
         where id = r.product_id;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.log_failed_login(p_email text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_recent integer;
begin
  v_email := coalesce(nullif(btrim(coalesce(p_email, '')), ''), '(blank)');
  -- Only logins attempted with an allowlisted admin email are worth recording
  -- — this also makes the RPC useless for flooding with random emails.
  if not exists (select 1 from public.admin_users where lower(email) = lower(v_email)) then
    return;
  end if;
  -- Simple throttle: at most 25 failed-login rows per 10 minutes.
  select count(*) into v_recent
    from public.admin_log
   where action = 'login_failed'
     and created_at > now() - interval '10 minutes';
  if v_recent >= 25 then
    return;
  end if;
  insert into public.admin_log (admin_id, action, target, detail)
  values (v_email, 'login_failed', null, left(coalesce(p_detail, ''), 500));
end;
$$;

grant execute on function public.admin_decrement_stock(jsonb) to authenticated;
grant execute on function public.admin_restore_order_stock(uuid[]) to authenticated;
grant execute on function public.log_failed_login(text, text) to anon, authenticated;
