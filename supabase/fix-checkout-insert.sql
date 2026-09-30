-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: checkout (orders) and contact form (feedback) inserts blocked on the
-- live database (error 42501 "new row violates row-level security policy").
--
-- Run this WHOLE file in Supabase Dashboard → SQL Editor. It only touches
-- policies on the two storefront-insert tables — nothing else. Safe to re-run.
-- After running, placing an order from the website works again.
-- ─────────────────────────────────────────────────────────────────────────────

-- orders: public can create (checkout) — everything else admin-only or via RPC
drop policy if exists "anon_select_orders" on public.orders;
drop policy if exists "anon_insert_orders" on public.orders;
drop policy if exists "anon_update_orders" on public.orders;
drop policy if exists "anon_delete_orders" on public.orders;
drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders" on public.orders
  for insert to anon, authenticated with check (true);
drop policy if exists "admin_all_orders" on public.orders;
create policy "admin_all_orders" on public.orders
  for all to authenticated using (is_admin()) with check (is_admin());

-- feedback: public contact form submits; reading/managing is admin-only
drop policy if exists "anon_select_feedback" on public.feedback;
drop policy if exists "anon_insert_feedback" on public.feedback;
drop policy if exists "anon_update_feedback" on public.feedback;
drop policy if exists "anon_delete_feedback" on public.feedback;
drop policy if exists "public_insert_feedback" on public.feedback;
create policy "public_insert_feedback" on public.feedback
  for insert to anon, authenticated with check (true);
drop policy if exists "admin_all_feedback" on public.feedback;
create policy "admin_all_feedback" on public.feedback
  for all to authenticated using (is_admin()) with check (is_admin());
