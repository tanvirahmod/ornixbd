/*
  Add a 3-state order status to replace the boolean `delivered` column.

  - orders.status: text, one of 'pending' | 'delivered' | 'canceled'
  - Backfills existing rows from the old boolean:
      delivered = true  -> 'delivered'
      delivered = false -> 'pending'
  - Adds a CHECK constraint so only valid values can be written.
  - Keeps the old `delivered` column in sync via trigger so any code
    still reading it (dashboards, exports, etc.) keeps working.
    You can drop the column later once nothing depends on it:

      ALTER TABLE orders DROP COLUMN delivered;

  Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'status'
  ) THEN
    ALTER TABLE orders ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Backfill from the old boolean column
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivered'
  ) THEN
    UPDATE orders SET status = CASE WHEN delivered THEN 'delivered' ELSE 'pending' END
    WHERE status IS NULL OR status NOT IN ('pending', 'delivered', 'canceled');
  END IF;
END $$;

-- Only allow valid status values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending', 'delivered', 'canceled'));
  END IF;
END $$;

-- Keep the legacy boolean in sync (true = delivered, false = pending/canceled)
CREATE OR REPLACE FUNCTION sync_order_delivered()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.delivered := (NEW.status = 'delivered');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_order_delivered ON orders;
CREATE TRIGGER trg_sync_order_delivered
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_delivered();
