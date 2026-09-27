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
