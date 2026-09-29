-- ── Richer activity log + admin login/logout session tracking ──────────────
-- What this migration does:
--   1) admin_logins — a table with one row per admin sign-in (logout_at set on
--      sign-out), powering the "Login sessions" panel in Settings → Activity.
--   2) log_admin_login() / log_admin_logout() — SECURITY DEFINER RPCs any
--      allowlisted admin can call; they stamp the caller's email, IP and
--      browser so the super admin sees WHERE each admin signed in from.
--   3) log_admin_activity() is unchanged — action-level "where from" context
--      is captured client-side by AdminPage's logAdmin helper instead, so
--      admin_log needs no schema change.
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
