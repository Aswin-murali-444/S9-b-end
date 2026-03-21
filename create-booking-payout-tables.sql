-- Create tables for company commission and worker payouts, linked to existing bookings/users.
-- Run this in Supabase SQL Editor (you can also call it via mcp_execute_sql).

BEGIN;

-- 1) Table to record each payout to a worker for a booking
CREATE TABLE IF NOT EXISTS booking_worker_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  total_amount NUMERIC(10,2) NOT NULL,          -- total paid by customer for this booking
  company_commission_amount NUMERIC(10,2) NOT NULL, -- 10% to company
  worker_payout_amount NUMERIC(10,2) NOT NULL,  -- 90% to worker
  payout_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'failed'
  payout_method TEXT,                            -- UPI, bank_transfer, cash, etc.
  payout_reference TEXT,                         -- external reference (UTR, Razorpay, etc.)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_booking_worker_payouts_booking
  ON booking_worker_payouts(booking_id);

CREATE INDEX IF NOT EXISTS idx_booking_worker_payouts_worker
  ON booking_worker_payouts(worker_id);

CREATE INDEX IF NOT EXISTS idx_booking_worker_payouts_status
  ON booking_worker_payouts(payout_status);

-- 2) Table to track company-level revenue from each booking
CREATE TABLE IF NOT EXISTS booking_company_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  total_amount NUMERIC(10,2) NOT NULL,
  company_commission_amount NUMERIC(10,2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_company_revenue_booking
  ON booking_company_revenue(booking_id);

COMMIT;

