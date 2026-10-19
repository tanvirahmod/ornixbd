-- Admin order editing with inventory kept in sync atomically.
create or replace function public.admin_edit_order_group(
  p_order_ids uuid[],
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_delivery_zone text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_input jsonb;
  v_product_id uuid;
  v_title text;
  v_code text;
  v_size text;
  v_quantity integer;
  v_subtotal numeric(10, 2);
  v_delivery numeric(10, 2);
  v_discount numeric(10, 2);
  v_advance numeric(10, 2);
  v_total numeric(10, 2);
  v_old_stock_size text;
  v_stock_change record;
  v_updated integer := 0;
  v_affected integer;
  v_stock_changes jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can edit orders.';
  end if;
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then
    raise exception 'The order items changed. Refresh the page and try again.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'The order items changed. Refresh the page and try again.';
  end if;
  if jsonb_array_length(p_rows) <> array_length(p_order_ids, 1) then
    raise exception 'The order items changed. Refresh the page and try again.';
  end if;
  if nullif(btrim(coalesce(p_customer_name, '')), '') is null
     or nullif(btrim(coalesce(p_customer_phone, '')), '') is null
     or nullif(btrim(coalesce(p_customer_address, '')), '') is null then
    raise exception 'Customer name, phone, and address are required.';
  end if;

  create temporary table order_edit_stock_delta (
    product_id uuid not null,
    stock_size text not null,
    delta integer not null,
    primary key (product_id, stock_size)
  ) on commit drop;

  for v_order in
    select *
      from public.orders
     where id = any(p_order_ids)
     order by id
     for update
  loop
    select value into v_input
      from jsonb_array_elements(p_rows)
     where value ->> 'id' = v_order.id::text;
    if not found then
      raise exception 'The order items changed. Refresh the page and try again.';
    end if;

    v_product_id := nullif(v_input ->> 'product_id', '')::uuid;
    v_title := nullif(btrim(coalesce(v_input ->> 'product_title', '')), '');
    v_code := nullif(btrim(coalesce(v_input ->> 'product_code', '')), '');
    v_size := nullif(btrim(coalesce(v_input ->> 'selected_size', '')), '');
    v_quantity := nullif(v_input ->> 'quantity', '')::integer;
    v_subtotal := round(nullif(v_input ->> 'subtotal', '')::numeric, 2);
    v_delivery := round(nullif(v_input ->> 'delivery_fee', '')::numeric, 2);
    v_discount := round(nullif(v_input ->> 'discount_amount', '')::numeric, 2);
    v_advance := round(nullif(v_input ->> 'advance_amount', '')::numeric, 2);
    v_total := round(v_subtotal + v_delivery - v_discount, 2);

    if v_title is null or v_quantity is null or v_quantity < 1
       or v_subtotal is null or v_delivery is null or v_discount is null or v_advance is null
       or v_subtotal < 0 or v_delivery < 0 or v_discount < 0
       or v_advance < 0 or v_total < 0 or v_advance > v_total then
      raise exception 'Check each item quantity and amount. Values must be valid and the advance cannot exceed the total.';
    end if;
    if v_product_id is not null and not exists (
      select 1 from public.products where id = v_product_id
    ) then
      raise exception 'A selected product no longer exists. Refresh and choose an available product.';
    end if;
    if v_product_id is not null and v_size is null
       and (v_order.product_id is distinct from v_product_id or v_order.selected_size is not null)
       and exists (select 1 from public.product_sizes where product_id = v_product_id) then
      raise exception 'Choose a size for the selected product.';
    end if;

    if v_order.status <> 'canceled' and v_order.product_id is not null
       and greatest(coalesce(v_order.quantity, 0), 0) > 0 then
      v_old_stock_size := '';
      if v_order.selected_size is not null then
        if exists (
          select 1 from public.product_sizes
           where product_id = v_order.product_id and size = v_order.selected_size
        ) then
          v_old_stock_size := v_order.selected_size;
        else
          v_old_stock_size := null;
        end if;
      end if;
      if v_old_stock_size is not null then
        insert into pg_temp.order_edit_stock_delta as stock_delta (product_id, stock_size, delta)
        values (v_order.product_id, v_old_stock_size, greatest(coalesce(v_order.quantity, 0), 0))
        on conflict (product_id, stock_size)
        do update set delta = stock_delta.delta + excluded.delta;
      end if;
    end if;

    if v_order.status <> 'canceled' and v_product_id is not null then
      if v_size is not null and not exists (
        select 1 from public.product_sizes where product_id = v_product_id and size = v_size
      ) and (v_product_id is distinct from v_order.product_id or v_size is distinct from v_order.selected_size) then
        raise exception 'The selected size is no longer available for this product. Refresh and choose another size.';
      end if;
      if v_size is null or exists (
        select 1 from public.product_sizes where product_id = v_product_id and size = v_size
      ) then
        insert into pg_temp.order_edit_stock_delta as stock_delta (product_id, stock_size, delta)
        values (v_product_id, coalesce(v_size, ''), -v_quantity)
        on conflict (product_id, stock_size)
        do update set delta = stock_delta.delta + excluded.delta;
      end if;
    end if;

    update public.orders
       set product_id = v_product_id,
           product_title = v_title,
           product_code = v_code,
           selected_size = v_size,
           quantity = v_quantity,
           customer_name = btrim(p_customer_name),
           customer_phone = btrim(p_customer_phone),
           customer_address = btrim(p_customer_address),
           delivery_zone = nullif(btrim(coalesce(p_delivery_zone, '')), ''),
           subtotal = v_subtotal,
           delivery_fee = v_delivery,
           discount_amount = v_discount,
           total_amount = v_total,
           advance_amount = v_advance,
           due_amount = round(v_total - v_advance, 2)
     where id = v_order.id;
    v_updated := v_updated + 1;
  end loop;

  if v_updated <> array_length(p_order_ids, 1) then
    raise exception 'The order items changed. Refresh the page and try again.';
  end if;
  if exists (
    select 1 from pg_temp.order_edit_stock_delta
     where delta <> 0
       and not exists (
         select 1
           from public.products p
          where p.id = order_edit_stock_delta.product_id
       )
  ) then
    raise exception 'A product was removed while editing this order.';
  end if;

  for v_stock_change in
    select * from pg_temp.order_edit_stock_delta
     where delta <> 0
     order by product_id, stock_size
  loop
    perform 1 from public.products where id = v_stock_change.product_id for update;
    if v_stock_change.stock_size = '' then
      update public.products
         set stock_count = coalesce(stock_count, 0) + v_stock_change.delta
       where id = v_stock_change.product_id
         and coalesce(stock_count, 0) + v_stock_change.delta >= 0;
      get diagnostics v_affected = row_count;
      if v_affected = 0 then
        raise exception 'There is not enough un-sized stock for one of the edited items.';
      end if;
    else
      update public.product_sizes
         set quantity = quantity + v_stock_change.delta
       where product_id = v_stock_change.product_id
         and size = v_stock_change.stock_size
         and quantity + v_stock_change.delta >= 0;
      get diagnostics v_affected = row_count;
      if v_affected = 0 then
        raise exception 'There is not enough stock in size % for an edited item.', v_stock_change.stock_size;
      end if;
      update public.products
         set stock_count = (
           select coalesce(sum(quantity), 0)
             from public.product_sizes
            where product_id = v_stock_change.product_id
         )
       where id = v_stock_change.product_id;
    end if;
  end loop;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'product_id', product_id,
      'size', nullif(stock_size, ''),
      'delta', delta
    )),
    '[]'::jsonb
  )
    into v_stock_changes
    from pg_temp.order_edit_stock_delta
   where delta <> 0;

  return v_stock_changes;
end;
$$;

revoke all on function public.admin_edit_order_group(uuid[], text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_edit_order_group(uuid[], text, text, text, text, jsonb) to authenticated;
