ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

UPDATE orders
SET quantity = 1
WHERE quantity IS NULL;
