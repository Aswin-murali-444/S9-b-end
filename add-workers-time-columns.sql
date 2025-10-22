-- Add simple fields to support multiple workers and increased time quantity
-- Keeps schema minimal as requested.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS workers_count integer DEFAULT 1;


