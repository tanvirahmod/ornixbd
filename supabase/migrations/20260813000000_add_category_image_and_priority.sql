/*
# Add background_image and priority to categories

1. Modified Tables
   - `categories`
     - Added `background_image` (text, nullable) — URL for the category showcase image
     - Added `priority` (integer, nullable) — lower number = shows first on collections page

2. Usage Notes
   - background_image: Recommended size **800×1000px** (3:4 aspect ratio, portrait orientation)
   - priority: Optional. Categories with lower numbers appear first. NULL = lowest priority
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'background_image'
  ) THEN
    ALTER TABLE categories ADD COLUMN background_image TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'priority'
  ) THEN
    ALTER TABLE categories ADD COLUMN priority INTEGER;
  END IF;
END $$;
