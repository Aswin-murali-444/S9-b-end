-- Run this in Supabase Dashboard → SQL Editor → New query
-- Creates the test table directly in your database (not via RPC/script)

CREATE TABLE IF NOT EXISTS public.test_cursor_table (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: verify it was created
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'test_cursor_table';
