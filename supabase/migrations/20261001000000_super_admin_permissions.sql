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
alter table public.admin_users add constraint admin_users_role_check
  check (role in ('super_admin', 'admin')) not valid;
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
create policy "settings_cap_site_settings" on site_settings for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

drop policy if exists "admin_all_announcements" on announcements;
create policy "settings_cap_announcements" on announcements for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

drop policy if exists "admin_all_expenses" on expenses;
create policy "settings_cap_expenses" on expenses for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

drop policy if exists "admin_all_admin_log" on admin_log;
create policy "settings_cap_admin_log" on admin_log for all to authenticated
  using (admin_has('settings')) with check (admin_has('settings'));

-- ── 5) admin_users itself: admins read the team list; only super admins
--       (via the RPCs above) change it. ──
drop policy if exists "super_admin_all_admin_users" on admin_users;
create policy "super_admin_all_admin_users" on admin_users for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
