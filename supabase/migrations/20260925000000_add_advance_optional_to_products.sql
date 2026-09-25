-- Per-product "no advance payment" flag.
-- When advance_optional = true, checkout for this product skips the bKash
-- number / TrxID step entirely: the customer pays the full amount in cash
-- on delivery (or at store pickup).

alter table public.products
  add column if not exists advance_optional boolean not null default false;

comment on column public.products.advance_optional is
  'When true, this product can be ordered without any bKash advance — full cash on delivery.';

-- Existing products keep the current behaviour (advance required), which the
-- default false already provides. No data backfill needed.
