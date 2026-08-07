
/*
# Online Store Schema

1. New Tables
  - `products`
    - id (uuid, primary key)
    - title (text, not null)
    - description (text)
    - price (numeric, not null)
    - sizes (text array, available sizes)
    - stock_count (integer, remaining inventory)
    - created_at (timestamp)
  - `product_images`
    - id (uuid, primary key)
    - product_id (uuid, fk → products)
    - image_url (text, not null)
    - display_order (integer, for ordering photos)
  - `orders`
    - id (uuid, primary key)
    - product_id (uuid, fk → products)
    - product_title (text, snapshot)
    - selected_size (text)
    - customer_name (text, not null)
    - customer_phone (text, not null)
    - customer_address (text, not null)
    - created_at (timestamp)

2. Security
  - RLS enabled on all tables
  - Public (anon) read on products and product_images
  - Anon can insert orders
  - All CRUD allowed for anon (admin manages via same anon key with frontend gate)
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric(10,2) NOT NULL DEFAULT 0,
  sizes text[] NOT NULL DEFAULT '{}',
  stock_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_title text NOT NULL,
  selected_size text,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_address text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Products policies
DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE TO anon, authenticated USING (true);

-- Product images policies
DROP POLICY IF EXISTS "anon_select_product_images" ON product_images;
CREATE POLICY "anon_select_product_images" ON product_images FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_product_images" ON product_images;
CREATE POLICY "anon_insert_product_images" ON product_images FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_product_images" ON product_images;
CREATE POLICY "anon_update_product_images" ON product_images FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_product_images" ON product_images;
CREATE POLICY "anon_delete_product_images" ON product_images FOR DELETE TO anon, authenticated USING (true);

-- Orders policies
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE TO anon, authenticated USING (true);
