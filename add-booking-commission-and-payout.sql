-- Add commission and payout tracking fields to bookings table (idempotent)
DO $$
BEGIN
  -- Total company commission amount for this booking
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookings'
      AND column_name = 'company_commission_amount'
  ) THEN
    ALTER TABLE bookings
      ADD COLUMN company_commission_amount NUMERIC(10,2) DEFAULT 0;
  END IF;

  -- Total payout amount owed to the worker / provider for this booking
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookings'
      AND column_name = 'worker_payout_amount'
  ) THEN
    ALTER TABLE bookings
      ADD COLUMN worker_payout_amount NUMERIC(10,2) DEFAULT 0;
  END IF;

  -- Status of payout to worker: 'pending', 'paid'
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookings'
      AND column_name = 'worker_payout_status'
  ) THEN
    ALTER TABLE bookings
      ADD COLUMN worker_payout_status TEXT DEFAULT 'pending';
  END IF;

  -- When payout to worker was marked as paid
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookings'
      AND column_name = 'worker_payout_paid_at'
  ) THEN
    ALTER TABLE bookings
      ADD COLUMN worker_payout_paid_at TIMESTAMPTZ;
  END IF;
END $$;

