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

-- Order tracking: expose only what the tracking page shows, only when the
-- caller knows the order code (and optionally the last 4 phone digits).
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
  customer_phone text
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
         end as customer_phone
  from public.orders o
  where o.order_code = p_order_code
  limit 1;
$$;

-- Checkout: decrement stock atomically, never below zero. One row per line
-- item: [{ "product_id": "…", "size": "L" | null, "quantity": 2 }, …]
create or replace function public.checkout_decrement_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  new_stock integer;
  new_size_stock integer;
begin
  for item in select * from jsonb_array_elements(p_items)
  loop
    if item ->> 'size' is null or (item ->> 'size') = '' then
      update public.products
         set stock_count = greatest(0, stock_count - greatest(1, least((item ->> 'quantity')::int, stock_count)))
       where id = (item ->> 'product_id')::uuid;
    else
      select greatest(0, quantity - greatest(1, least((item ->> 'quantity')::int, quantity)))
        into new_size_stock
        from public.product_sizes
       where product_id = (item ->> 'product_id')::uuid
         and size = item ->> 'size'
       limit 1;
      if found then
        update public.product_sizes
           set quantity = new_size_stock
         where product_id = (item ->> 'product_id')::uuid
           and size = item ->> 'size';
        -- keep product-level total in sync
        select coalesce(sum(quantity), 0) into new_stock
          from public.product_sizes
         where product_id = (item ->> 'product_id')::uuid;
        update public.products
           set stock_count = new_stock
         where id = (item ->> 'product_id')::uuid;
      end if;
    end if;
  end loop;
end;
$$;

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
create policy "public_read_products" on products for select to anon, authenticated using (true);
create policy "admin_all_products" on products for all to authenticated using (is_admin()) with check (is_admin());

-- product_images
drop policy if exists "anon_select_product_images" on product_images;
drop policy if exists "anon_insert_product_images" on product_images;
drop policy if exists "anon_update_product_images" on product_images;
drop policy if exists "anon_delete_product_images" on product_images;
create policy "public_read_product_images" on product_images for select to anon, authenticated using (true);
create policy "admin_all_product_images" on product_images for all to authenticated using (is_admin()) with check (is_admin());

-- product_sizes
drop policy if exists "Allow public read product_sizes" on product_sizes;
drop policy if exists "Allow public insert product_sizes" on product_sizes;
drop policy if exists "Allow public update product_sizes" on product_sizes;
drop policy if exists "Allow public delete product_sizes" on product_sizes;
create policy "public_read_product_sizes" on product_sizes for select to anon, authenticated using (true);
create policy "admin_all_product_sizes" on product_sizes for all to authenticated using (is_admin()) with check (is_admin());

-- categories
drop policy if exists "anon_select_categories" on categories;
drop policy if exists "anon_insert_categories" on categories;
drop policy if exists "anon_update_categories" on categories;
drop policy if exists "anon_delete_categories" on categories;
create policy "public_read_categories" on categories for select to anon, authenticated using (true);
create policy "admin_all_categories" on categories for all to authenticated using (is_admin()) with check (is_admin());

-- size_chart_templates (created before policies existed for it)
drop policy if exists "size_chart_templates fully accessible" on size_chart_templates;
create policy "public_read_size_charts" on size_chart_templates for select to anon, authenticated using (true);
create policy "admin_all_size_charts" on size_chart_templates for all to authenticated using (is_admin()) with check (is_admin());

-- announcements
drop policy if exists "anon_select_announcements" on announcements;
drop policy if exists "anon_all_announcements" on announcements;
create policy "public_read_active_announcements" on announcements for select to anon, authenticated using (is_active = true);
create policy "admin_all_announcements" on announcements for all to authenticated using (is_admin()) with check (is_admin());

-- site_settings (checkout reads courier rates + bKash number)
drop policy if exists "anon_select_site_settings" on site_settings;
drop policy if exists "anon_all_site_settings" on site_settings;
create policy "public_read_site_settings" on site_settings for select to anon, authenticated using (true);
create policy "admin_all_site_settings" on site_settings for all to authenticated using (is_admin()) with check (is_admin());

-- coupons: checkout validates codes client-side; only active/unexpired are visible
drop policy if exists "anon_select_coupons" on coupons;
drop policy if exists "anon_insert_coupons" on coupons;
drop policy if exists "anon_update_coupons" on coupons;
drop policy if exists "anon_delete_coupons" on coupons;
create policy "public_read_active_coupons" on coupons for select to anon, authenticated
  using (is_active = true and (expires_at is null or expires_at > now()));
create policy "admin_all_coupons" on coupons for all to authenticated using (is_admin()) with check (is_admin());

-- orders: public can create (checkout) — everything else is admin-only or via RPC
drop policy if exists "anon_select_orders" on orders;
drop policy if exists "anon_insert_orders" on orders;
drop policy if exists "anon_update_orders" on orders;
drop policy if exists "anon_delete_orders" on orders;
create policy "public_insert_orders" on orders for insert to anon, authenticated with check (true);
create policy "admin_all_orders" on orders for all to authenticated using (is_admin()) with check (is_admin());

-- feedback: public contact form submits; reading/managing is admin-only
drop policy if exists "anon_select_feedback" on feedback;
drop policy if exists "anon_insert_feedback" on feedback;
drop policy if exists "anon_update_feedback" on feedback;
drop policy if exists "anon_delete_feedback" on feedback;
create policy "public_insert_feedback" on feedback for insert to anon, authenticated with check (true);
create policy "admin_all_feedback" on feedback for all to authenticated using (is_admin()) with check (is_admin());

-- expenses / stock_movements / admin_log / sellers — admin only
drop policy if exists "expenses fully accessible" on expenses;
create policy "admin_all_expenses" on expenses for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "stock movements fully accessible" on stock_movements;
create policy "admin_all_stock_movements" on stock_movements for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "admin log fully accessible" on admin_log;
create policy "admin_all_admin_log" on admin_log for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "sellers fully accessible" on sellers;
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
