-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: checkout (orders) and contact form (feedback) inserts blocked on the
-- live database (error 42501 "new row violates row-level security policy").
--
-- MINIMAL VERSION — this file CANNOT fail, so it CANNOT roll back:
--   • only 4 statements that need no other functions or objects
--   • does NOT touch admin policies (admin panel already works)
--   • ends with a SELECT so you SEE the new policies in the result panel
--
-- The Supabase SQL Editor runs a whole script as ONE transaction — if any
-- statement errors, every statement is rolled back. The previous repair
-- included "admin_all" policies that call is_admin(); if that function is
-- missing, everything (including the insert fix) silently rolled back.
--
-- Run in: Supabase Dashboard → SQL Editor → project uzuzffvnukhdckaqqvfa
-- Expected result: "Success" + rows listing public_insert_orders and
-- public_insert_feedback. Then placing an order from the website works.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "public_insert_orders" on public.orders;
create policy "public_insert_orders" on public.orders
  for insert to anon, authenticated with check (true);

drop policy if exists "public_insert_feedback" on public.feedback;
create policy "public_insert_feedback" on public.feedback
  for insert to anon, authenticated with check (true);

-- CONFIRMATION — these two rows must appear in the result panel:
select tablename, policyname, cmd, roles, permissive
from pg_policies
where schemaname = 'public'
  and tablename in ('orders', 'feedback')
  and policyname like 'public_insert_%'
order by tablename, policyname;
