-- Per-category visibility flag.
-- When is_hidden = true, the category disappears from all storefront surfaces
-- (navbar dropdown, home page top categories, shop page filter, shop-by-size
-- page) but keeps working via direct collection links and stays fully editable
-- in the admin panel.

alter table public.categories
  add column if not exists is_hidden boolean not null default false;

comment on column public.categories.is_hidden is
  'When true, this category is hidden from the storefront (navbar, home, shop filters). Direct collection links still work.';
