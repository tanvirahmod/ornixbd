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
