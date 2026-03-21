-- Service reviews table to store customer feedback per service
-- Run this via your existing MCP / Supabase SQL workflow.

-- Ensure required extensions (for gen_random_uuid) are available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Main reviews table
CREATE TABLE IF NOT EXISTS service_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note TEXT,
  answers JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate reviews for the same service by the same customer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_reviews_unique_customer_service'
  ) THEN
    ALTER TABLE service_reviews
      ADD CONSTRAINT service_reviews_unique_customer_service
      UNIQUE (service_id, customer_id);
  END IF;
END$$;

-- Add aggregate rating fields on services (if they don't exist yet)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

