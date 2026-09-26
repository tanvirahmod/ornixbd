-- ─────────────────────────────────────────────────────────────────────────────
-- Per-product size charts (measurement tables) with reusable templates.
--
-- Many products share identical measurements, so charts live in their own
-- table and products reference one by id. Editing a template updates every
-- product that uses it. A product with no reference simply shows no chart.
--
-- size_chart_templates.measurements shape (JSONB, rows × sizes):
--   {
--     "rows":   ["Chest", "Length"],
--     "sizes":  ["S", "M", "L", "XL"],
--     "values": { "Chest":  { "S": "40", "M": "42", "L": "44", "XL": "46" },
--                 "Length": { "S": "27", "M": "28", "L": "28.5", "XL": "29" } },
--     "note":   "Measurements in inches · fit: relaxed"   -- optional
--   }
-- Values are free text so admins can write "40 in", "28.5", "—", etc.
-- Run once in Supabase SQL Editor — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.size_chart_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  measurements jsonb not null default '{"rows":[],"sizes":[],"values":{}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.size_chart_templates enable row level security;

drop policy if exists "size_chart_templates fully accessible" on public.size_chart_templates;
create policy "size_chart_templates fully accessible"
  on public.size_chart_templates for all to anon, authenticated
  using (true) with check (true);

comment on table public.size_chart_templates is
  'Reusable measurement charts (rows × sizes JSONB) referenced by products.';

-- products: link to a chart template (nullable = no chart shown)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'size_chart_template_id'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN size_chart_template_id uuid REFERENCES public.size_chart_templates(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- ============ done ============
