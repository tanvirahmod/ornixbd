-- ─────────────────────────────────────────────────────────────────────────────
-- Admin expansion: profit tracking, stock-movement history, admin activity log.
-- Run once in Supabase SQL Editor — everything is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Cost price per product — powers margin + net profit on the Finance tab
alter table public.products
  add column if not exists cost_price numeric(10, 2);

comment on column public.products.cost_price is
  'What the product costs the merchant (supplier price). Powers margin and net-profit reporting. NULL = unknown.';

-- 2) Business expenses — ads, packaging, rent, courier top-ups…
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  note text,
  spent_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

drop policy if exists "expenses fully accessible" on public.expenses;
create policy "expenses fully accessible"
  on public.expenses for all to anon, authenticated
  using (true) with check (true);

comment on table public.expenses is
  'Business expenses entered in the admin Finance tab; subtracted from gross profit for net profit.';

-- 3) Stock movement history — every stock change with a reason
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,
  delta integer not null,
  reason text not null,
  note text,
  admin_id text,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);

alter table public.stock_movements enable row level security;

drop policy if exists "stock movements fully accessible" on public.stock_movements;
create policy "stock movements fully accessible"
  on public.stock_movements for all to anon, authenticated
  using (true) with check (true);

comment on column public.stock_movements.delta is
  'Signed change in units: negative = stock left (customer order, manual sell, correction), positive = stock added (restock).';

comment on column public.stock_movements.reason is
  'Why stock changed: order / manual_sell / restock / cancel_restore / adjustment.';

-- 4) Admin activity log — which admin did what
create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  action text not null,
  target text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists admin_log_created_idx
  on public.admin_log (created_at desc);

alter table public.admin_log enable row level security;

drop policy if exists "admin log fully accessible" on public.admin_log;
create policy "admin log fully accessible"
  on public.admin_log for all to anon, authenticated
  using (true) with check (true);

comment on table public.admin_log is
  'Audit trail of admin actions: status changes, Steadfast bookings, deletions, product edits, restocks.';

-- ============ done ============
