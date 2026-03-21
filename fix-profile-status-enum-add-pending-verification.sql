-- Fix: Add 'pending_verification' to profile_status enum
-- The profile_profiles table (or its default/triggers) uses 'pending_verification'
-- but the enum only had: incomplete, pending, active, verified, rejected, suspended.
-- This adds the missing value so profile completion upsert succeeds.

-- 1) Add 'pending_verification' to the enum (safe, won't fail if already exists in PG 9.1+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pending_verification'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'profile_status')
  ) THEN
    ALTER TYPE public.profile_status ADD VALUE 'pending_verification';
    RAISE NOTICE 'Added pending_verification to profile_status enum';
  ELSE
    RAISE NOTICE 'pending_verification already exists in profile_status enum';
  END IF;
END $$;

-- 2) Ensure the default is valid (incomplete is always in enum)
ALTER TABLE public.provider_profiles 
  ALTER COLUMN status SET DEFAULT 'incomplete';

-- Done! Run this in Supabase SQL Editor to fix the 500 error on profile completion.
