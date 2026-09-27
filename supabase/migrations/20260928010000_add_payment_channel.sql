-- ── Nagad as a second advance-payment channel at checkout ──
-- payment_channel records which mobile wallet the customer sent the advance
-- through ('bkash' | 'nagad'). The bKash/Nagad numbers themselves live in
-- site_settings (checkout_bkash_number / checkout_nagad_number) — no SQL
-- needed for those; set them in Admin → Settings.
-- Safe to re-run; the app keeps working even if this migration is pending
-- (checkout falls back to the pre-channel payload automatically).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_channel'
  ) THEN
    alter table public.orders add column payment_channel text;
    comment on column public.orders.payment_channel is
      'Mobile wallet the customer used for the advance: bkash or nagad. NULL = bKash (pre-Nagad orders) or no advance required.';
  END IF;
END $$;
