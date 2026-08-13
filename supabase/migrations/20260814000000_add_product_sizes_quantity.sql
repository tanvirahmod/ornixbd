CREATE TABLE IF NOT EXISTS product_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, size)
);

INSERT INTO product_sizes (product_id, size, quantity)
SELECT id, unnest(sizes), 0
FROM products
WHERE array_length(sizes, 1) > 0
ON CONFLICT DO NOTHING;

ALTER TABLE product_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read product_sizes" ON product_sizes FOR SELECT USING (true);
CREATE POLICY "Allow public insert product_sizes" ON product_sizes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update product_sizes" ON product_sizes FOR UPDATE USING (true);
CREATE POLICY "Allow public delete product_sizes" ON product_sizes FOR DELETE USING (true);
