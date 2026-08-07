/*
  Add auto product code to products + store it on orders
  - products.product_code: text, unique, auto-generated as PRD-XXXXX
  - orders.product_code: text, snapshot of the product's code at order time
*/
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'product_code'
  ) THEN
    ALTER TABLE products ADD COLUMN product_code text;
  END IF;
END $$;

-- Backfill existing products with codes PRD-00001, PRD-00002, ...
DO $$
DECLARE
  r RECORD;
  seq integer := 1;
BEGIN
  FOR r IN SELECT id FROM products WHERE product_code IS NULL ORDER BY created_at ASC LOOP
    UPDATE products
      SET product_code = 'PRD-' || lpad(seq::text, 5, '0')
      WHERE id = r.id;
    seq := seq + 1;
  END LOOP;
END $$;

-- Enforce uniqueness after backfill
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_product_code_key'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_product_code_key UNIQUE (product_code);
  END IF;
END $$;

-- Auto-generate code for new products via trigger
CREATE OR REPLACE FUNCTION generate_product_code()
RETURNS trigger AS $$
DECLARE
  next_code text;
BEGIN
  IF NEW.product_code IS NULL THEN
    SELECT 'PRD-' || lpad((COALESCE(MAX(
      CAST(NULLIF(regexp_replace(product_code, '\D', '', 'g'), '') AS integer)
    ), 0) + 1)::text, 5, '0')
    INTO next_code
    FROM products;
    NEW.product_code := next_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_product_code ON products;
CREATE TRIGGER trg_generate_product_code
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION generate_product_code();

-- Snapshot product_code on orders
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'product_code'
  ) THEN
    ALTER TABLE orders ADD COLUMN product_code text;
  END IF;
END $$;
