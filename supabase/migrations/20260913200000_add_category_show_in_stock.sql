/*
  Add a stock-page visibility flag to categories.

  - categories.show_in_stock (boolean, default true)
  - Controls whether a category appears in the admin Stock Management page.
  - Hiding it here does NOT delete the category or affect the storefront —
    it only removes it from the stock page's category list.
  - Existing categories default to visible, so nothing changes until an
    admin explicitly removes one.

  Run in Supabase Dashboard → SQL Editor. Safe to run multiple times.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'show_in_stock'
  ) THEN
    ALTER TABLE categories ADD COLUMN show_in_stock boolean NOT NULL DEFAULT true;
  END IF;
END $$;
