/*
  Product-specific coupons
  - coupons.product_codes: text array of product codes (e.g. '{PRD-1001,PRD-1002}').
    Empty array = coupon applies to all products.
  Run AFTER 20260924000000_add_checkout_fields_and_coupons.sql.
  (Skips itself if the column already exists.)
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'coupons'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'product_codes'
  ) THEN
    ALTER TABLE coupons ADD COLUMN product_codes text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
