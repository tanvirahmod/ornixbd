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
