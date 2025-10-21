-- =====================================================
-- DELETE PROVIDER PROFILE VIEW FROM SUPABASE
-- =====================================================
-- This script removes the provider_profile_view
-- Run this in your Supabase SQL Editor

-- Drop the view if it exists
DROP VIEW IF EXISTS public.provider_profile_view;

-- Verify the view has been removed
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'provider_profile_view'
      AND table_type = 'VIEW'
    ) 
    THEN 'View still exists' 
    ELSE 'View successfully deleted' 
  END as status;
