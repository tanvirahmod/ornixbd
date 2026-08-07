/*
# Add discount_price to products and delivered status to orders

1. Changes to `products` table:
   - Add `discount_price` (numeric, nullable) — optional discounted price.
     When present and lower than `price`, the product page shows the original
     price struck-through and the discount price as the current price.

2. Changes to `orders` table:
   - Add `delivered` (boolean, default false) — lets the admin mark orders as
     delivered or pending.

3. Security:
   - No new tables. Existing RLS policies on products and orders already
     allow anon + authenticated CRUD (single-tenant, no-auth storefront).
   - No policy changes needed since the new columns inherit the table-level
     policies already in place.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS discount_price numeric;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered boolean NOT NULL DEFAULT false;
