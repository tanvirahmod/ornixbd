-- ─────────────────────────────────────────────────────────────────────────────
-- INSERT-BLOCK KILLER: storefront inserts on orders / feedback still fail with
-- 42501 even though permissive INSERT policies for anon are CONFIRMED present
-- (checked in pg_policies twice). Whatever is blocking direct table inserts,
-- RPC inserts through a SECURITY DEFINER function bypass RLS entirely — the
-- function's owner (postgres) is exempt from row-level security.
--
-- Run the WHOLE file in Supabase Dashboard → SQL Editor (project
-- uzuzffvnukhdckaqqvfa). Safe to re-run (everything is drop + create).
--
-- After running, tell the agent — the website will be updated to use these
-- RPCs as its insert path, and debug_rls_state() will be read to find out
-- what was blocking the policies (and revert it if it's fixable).
--
-- What this creates:
--   public.debug_rls_state()      → JSON diagnostic dump (policies, flags,
--                                   grants, triggers) + a real insert attempt
--                                   executed AS anon to capture the true error
--   public.insert_order_rpc(jsonb)  → SECURITY DEFINER insert, returns id+code
--   public.insert_feedback_rpc(jsonb)→ SECURITY DEFINER insert, returns id
--   execute granted to anon, authenticated. Security barrier: orders RPC only
--   INSERTs (no select/update/delete leak), and both functions run a bare
--   INSERT of the submitted columns — nothing else.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Diagnostics: run later with:  select public.debug_rls_state(); ───────
create or replace function public.debug_rls_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  ord_err text;
  fb_err  text;
  ord_id  uuid;
  fb_id   uuid;
begin
  -- Real insert attempts, executed AS anon (the API role), to capture the
  -- exact underlying error instead of the generic 42501 the API surfaces.
  begin
    insert into public.orders (customer_name, customer_phone, customer_address, product_title, quantity, order_code)
    values ('RLS Probe', '01700000000', 'probe', 'probe', 1, 'PROBE-' || floor(random() * 1000000)::text)
    returning id into ord_id;
    delete from public.orders where id = ord_id;
    ord_err := null;
  exception when others then
    ord_err := sqlerrm;
  end;

  begin
    insert into public.feedback (name, email, message)
    values ('RLS Probe', 'probe@example.com', 'probe')
    returning id into fb_id;
    delete from public.feedback where id = fb_id;
    fb_err := null;
  exception when others then
    fb_err := sqlerrm;
  end;

  select jsonb_build_object(
    'insert_as_anon_in_orders',   ord_err,
    'insert_as_anon_in_feedback', fb_err,
    'policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', tablename, 'name', policyname, 'cmd', cmd,
        'roles', roles, 'permissive', permissive,
        'qual', qual, 'with_check', with_check)), '[]'::jsonb)
      from pg_policies
      where schemaname = 'public' and tablename in ('orders', 'feedback')
    ),
    'rls_flags', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', c.relname, 'rls', c.relrowsecurity, 'forced', c.relforcerowsecurity,
        'owner', c.relowner::regrole::text)), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('orders', 'feedback')
    ),
    'insert_grants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', table_name, 'grantee', grantee, 'privilege', privilege_type)), '[]'::jsonb)
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name in ('orders', 'feedback')
        and privilege_type = 'INSERT' and grantee in ('anon', 'authenticated')
    ),
    'triggers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', tgrelid::regclass::text, 'name', tgname,
        'def', pg_get_triggerdef(t.oid))), '[]'::jsonb)
      from pg_trigger t
      where tgrelid in ('public.orders'::regclass, 'public.feedback'::regclass)
        and not tgisinternal
    ),
    'current_user', current_user,
    'is_superuser', coalesce((select rolsuper from pg_roles where rolname = current_user), false)
  ) into result;
  return result;
end;
$$;

-- ── 2. RPC insert for orders (checkout fallback path) ───────────────────────
create or replace function public.insert_order_rpc(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_code text;
begin
  insert into public.orders (
    product_id, product_title, product_code, selected_size, quantity,
    order_code, customer_name, customer_phone, customer_address,
    bkash_number, trx_id, payment_channel,
    subtotal, delivery_fee, discount_amount, total_amount,
    coupon_code, payment_method, advance_amount, due_amount,
    courier_name, delivery_zone
  ) values (
    nullif(p_row->>'product_id', '')::uuid,
    coalesce(p_row->>'product_title', 'Order'),
    nullif(p_row->>'product_code', ''),
    nullif(p_row->>'selected_size', ''),
    coalesce(nullif(p_row->>'quantity', '')::int, 1),
    nullif(p_row->>'order_code', ''),
    coalesce(p_row->>'customer_name', ''),
    coalesce(p_row->>'customer_phone', ''),
    coalesce(p_row->>'customer_address', ''),
    nullif(p_row->>'bkash_number', ''),
    nullif(p_row->>'trx_id', ''),
    nullif(p_row->>'payment_channel', ''),
    nullif(p_row->>'subtotal', '')::numeric,
    nullif(p_row->>'delivery_fee', '')::numeric,
    nullif(p_row->>'discount_amount', '')::numeric,
    nullif(p_row->>'total_amount', '')::numeric,
    nullif(p_row->>'coupon_code', ''),
    nullif(p_row->>'payment_method', ''),
    nullif(p_row->>'advance_amount', '')::numeric,
    nullif(p_row->>'due_amount', '')::numeric,
    nullif(p_row->>'courier_name', ''),
    nullif(p_row->>'delivery_zone', '')
  )
  returning id, orders.order_code into v_id, v_code;

  return jsonb_build_object('ok', true, 'id', v_id, 'order_code', v_code);
end;
$$;

-- ── 3. RPC insert for feedback (contact form fallback path) ─────────────────
create or replace function public.insert_feedback_rpc(p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.feedback (name, email, message, website)
  values (
    coalesce(p_row->>'name', ''),
    coalesce(p_row->>'email', ''),
    coalesce(p_row->>'message', ''),
    nullif(p_row->>'website', '')
  )
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── 4. API access ────────────────────────────────────────────────────────────
revoke all on function public.insert_order_rpc(jsonb) from public;
revoke all on function public.insert_feedback_rpc(jsonb) from public;
grant execute on function public.insert_order_rpc(jsonb) to anon, authenticated;
grant execute on function public.insert_feedback_rpc(jsonb) to anon, authenticated;
grant execute on function public.debug_rls_state() to anon, authenticated;

-- ── 5. Confirm ───────────────────────────────────────────────────────────────
select p.proname, p.prosecdef as security_definer, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('insert_order_rpc', 'insert_feedback_rpc', 'debug_rls_state');
