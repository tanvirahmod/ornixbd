/*
  Add bKash payment fields to orders
  - bkash_number  (text, customer's bKash number they sent from)
  - trx_id       (text, the bKash Transaction ID)
  Both nullable so existing orders are unaffected.
*/
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'bkash_number'
  ) THEN
    ALTER TABLE orders ADD COLUMN bkash_number text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'trx_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN trx_id text;
  END IF;
END $$;
