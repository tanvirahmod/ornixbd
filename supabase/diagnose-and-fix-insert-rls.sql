-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSE + FIX: storefront inserts still 42501 on orders / feedback even
-- though public_insert_orders / public_insert_feedback exist (verified).
--
-- Run the WHOLE file in Supabase Dashboard → SQL Editor (project
-- uzuzffvnukhdckaqqvfa). Safe to re-run. It does three things:
--
--   PART A  Diagnostics — one result tab per section (all read-only):
--           1. every policy on the two tables, with definitions
--           2. RLS enabled/forced flags + table owner
--           3. INSERT grants for anon/authenticated
--           4. non-internal triggers on the two tables
--   PART B  Drops any RESTRICTIVE insert-blocking policy on the two tables.
--           Restrictive policies can only ever narrow access; removing them
--           from storefront tables cannot break the admin panel. What it
--           dropped appears in the "Messages" tab.
--   PART C  Reloads the PostgREST schema cache (NOTIFY pgrst) so the API
--           immediately sees the new policies, then lists the final state.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PART A: diagnostics ─────────────────────────────────────────────────────

-- 1. ALL policies with full definitions (look for permissive = RESTRICTIVE)
select 'A1_policies' as section,
       tablename, policyname, cmd, roles, permissive, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('orders', 'feedback')
order by tablename, permissive desc, cmd, policyname;

-- 2. RLS flags + owner
select 'A2_rls_flags' as section,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       c.relowner::regrole as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('orders', 'feedback');

-- 3. INSERT grants for the API roles
select 'A3_insert_grants' as section, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('orders', 'feedback')
  and privilege_type = 'INSERT'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee;

-- 4. Triggers (a trigger inserting into ANOTHER locked-down table shows the
--    other table's name in the error — this rules that in/out)
select 'A4_triggers' as section,
       tgrelid::regclass as table_name, tgname,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where tgrelid in ('public.orders'::regclass, 'public.feedback'::regclass)
  and not tgisinternal;

-- ── PART B: drop RESTRICTIVE insert-blocking policies ───────────────────────

do $$
declare
  r record;
  dropped int := 0;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'feedback')
      and permissive = 'RESTRICTIVE'
      and cmd in ('INSERT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    dropped := dropped + 1;
    raise notice 'DROPPED restrictive policy "%" on %.', r.policyname, r.tablename;
  end loop;
  if dropped = 0 then
    raise notice 'No restrictive INSERT policies found — nothing dropped in part B.';
  else
    raise notice 'Dropped % restrictive INSERT policies total.', dropped;
  end if;
end $$;

-- ── PART C: refresh PostgREST schema cache + confirm ────────────────────────

notify pgrst, 'reload schema';

-- Final state: these rows (public_insert_orders / public_insert_feedback,
-- PERMISSIVE) should be the insert-related policies left on the two tables.
select 'C_final_policies' as section,
       tablename, policyname, cmd, roles, permissive
from pg_policies
where schemaname = 'public' and tablename in ('orders', 'feedback')
  and cmd in ('INSERT', 'ALL')
order by tablename, policyname;
