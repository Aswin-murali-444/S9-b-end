-- Add bank and UPI details for service providers (idempotent migration)
DO $$
BEGIN
  -- UPI ID for payouts (e.g., phone@upi)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'service_provider_details'
      AND column_name = 'upi_id'
  ) THEN
    ALTER TABLE public.service_provider_details
      ADD COLUMN upi_id TEXT;
  END IF;

  -- Bank account number (store as text to preserve leading zeros)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'service_provider_details'
      AND column_name = 'bank_account_number'
  ) THEN
    ALTER TABLE public.service_provider_details
      ADD COLUMN bank_account_number TEXT;
  END IF;

  -- Bank IFSC code
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'service_provider_details'
      AND column_name = 'bank_ifsc'
  ) THEN
    ALTER TABLE public.service_provider_details
      ADD COLUMN bank_ifsc TEXT;
  END IF;

  -- Bank name
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'service_provider_details'
      AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE public.service_provider_details
      ADD COLUMN bank_name TEXT;
  END IF;

  -- Account holder name
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'service_provider_details'
      AND column_name = 'account_holder_name'
  ) THEN
    ALTER TABLE public.service_provider_details
      ADD COLUMN account_holder_name TEXT;
  END IF;

  -- Payout preference: 'upi' or 'bank'
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'service_provider_details'
      AND column_name = 'payout_preference'
  ) THEN
    ALTER TABLE public.service_provider_details
      ADD COLUMN payout_preference TEXT DEFAULT 'upi';
  END IF;
END $$;

