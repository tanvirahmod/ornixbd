-- ─────────────────────────────────────────────────────────────────────────────
-- Saved sellers for the Manual Orders tab: names typed into the seller field
-- are stored here so they come back as dropdown suggestions, each deletable
-- from the dropdown. Run once in Supabase SQL Editor — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.sellers enable row level security;

drop policy if exists "sellers fully accessible" on public.sellers;
create policy "sellers fully accessible"
  on public.sellers for all to anon, authenticated
  using (true) with check (true);

comment on table public.sellers is
  'Saved seller names for the Manual Orders dropdown; admins can delete entries.';

-- Backfill: every seller already recorded on an order becomes a saved name
insert into public.sellers (name)
select distinct trim(seller_name)
from public.orders
where seller_name is not null and trim(seller_name) <> ''
on conflict (name) do nothing;

-- ============ done ============
