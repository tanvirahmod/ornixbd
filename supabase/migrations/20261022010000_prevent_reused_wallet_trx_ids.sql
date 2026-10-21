-- Prevent a bKash/Nagad transaction ID from being attached to multiple orders.
-- Multi-item checkouts write one row per item, so rows sharing one order_code
-- are allowed to carry the same payment reference.
alter table public.orders
  add column if not exists payment_channel text;

create or replace function public.reject_reused_wallet_trx_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text;
  v_trx_id text;
begin
  if new.trx_id is null or btrim(new.trx_id) = '' then
    return new;
  end if;

  -- Older bKash orders predate payment_channel and have NULL in that column.
  v_channel := lower(coalesce(nullif(btrim(new.payment_channel), ''), 'bkash'));
  v_trx_id := lower(btrim(new.trx_id));

  -- Serialize competing checkout requests that use the same operator and ID.
  perform pg_advisory_xact_lock(hashtextextended(v_channel || ':' || v_trx_id, 0));

  if exists (
    select 1
      from public.orders existing
     where lower(coalesce(nullif(btrim(existing.payment_channel), ''), 'bkash')) = v_channel
       and lower(btrim(existing.trx_id)) = v_trx_id
       and existing.id is distinct from new.id
       and (new.order_code is null or existing.order_code is distinct from new.order_code)
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'orders_payment_channel_trx_id_unique',
      message = 'This transaction ID has already been used for this payment operator.';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_reject_reused_wallet_trx_id_insert on public.orders;
create trigger orders_reject_reused_wallet_trx_id_insert
  before insert on public.orders
  for each row
  execute function public.reject_reused_wallet_trx_id();

drop trigger if exists orders_reject_reused_wallet_trx_id_update on public.orders;
create trigger orders_reject_reused_wallet_trx_id_update
  before update of trx_id, payment_channel, order_code on public.orders
  for each row
  execute function public.reject_reused_wallet_trx_id();
