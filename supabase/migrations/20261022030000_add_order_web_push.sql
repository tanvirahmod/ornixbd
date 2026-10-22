-- Web Push subscriptions are writable only through the admin-authenticated
-- Edge Function. The service-role sender reads subscriptions and claims each
-- order exactly once, even when the order has several item rows.

create extension if not exists pg_net with schema extensions;

create table if not exists public.admin_push_subscriptions (
  endpoint text primary key,
  admin_email text not null references public.admin_users(email) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_push_subscriptions_admin_email_idx
  on public.admin_push_subscriptions (admin_email);

alter table public.admin_push_subscriptions enable row level security;
revoke all on public.admin_push_subscriptions from anon, authenticated;

create table if not exists public.order_push_deliveries (
  order_key text primary key,
  order_code text,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'partial', 'failed')),
  attempted_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.order_push_deliveries enable row level security;
revoke all on public.order_push_deliveries from anon, authenticated;

create or replace function public.notify_new_order_push()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  push_url text;
  webhook_secret text;
begin
  select decrypted_secret into push_url
    from vault.decrypted_secrets
    where name = 'order_push_function_url'
    order by created_at desc
    limit 1;
  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'order_push_webhook_secret'
    order by created_at desc
    limit 1;

  if coalesce(push_url, '') = '' or coalesce(webhook_secret, '') = '' then
    raise warning 'Order push is not active: configure order_push_function_url and order_push_webhook_secret in Supabase Vault.';
    return new;
  end if;

  perform net.http_post(
    url := push_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-order-push-secret', webhook_secret
    ),
    body := jsonb_build_object('order_code', new.order_code, 'order_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'Could not enqueue order push for %: %', coalesce(new.order_code, new.id::text), sqlerrm;
  return new;
end;
$$;

drop trigger if exists notify_new_order_push on public.orders;
create trigger notify_new_order_push
  after insert on public.orders
  for each row execute function public.notify_new_order_push();

comment on table public.admin_push_subscriptions is
  'Private Web Push subscriptions for authenticated admin devices; service-role access only.';
comment on table public.order_push_deliveries is
  'Idempotency records preventing duplicate push alerts for multi-row checkout orders.';
