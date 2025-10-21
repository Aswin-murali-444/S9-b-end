-- =====================================================
-- CART AND WISHLIST TABLES MIGRATION SCRIPT
-- =====================================================
-- This script fixes the foreign key constraints and column issues
-- Run this if you already created the tables with the wrong references

-- 1) Drop existing tables if they exist (this will delete all data!)
-- Uncomment the lines below ONLY if you want to start fresh
-- DROP TABLE IF EXISTS public.user_cart CASCADE;
-- DROP TABLE IF EXISTS public.user_wishlist CASCADE;

-- 2) Alternative: Update foreign key constraints without losing data
-- First, drop the existing foreign key constraints
DO $$
BEGIN
  -- Drop foreign key constraint on user_cart if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_cart_user_id_fkey' 
    AND table_name = 'user_cart'
  ) THEN
    ALTER TABLE public.user_cart DROP CONSTRAINT user_cart_user_id_fkey;
  END IF;

  -- Drop foreign key constraint on user_wishlist if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_wishlist_user_id_fkey' 
    AND table_name = 'user_wishlist'
  ) THEN
    ALTER TABLE public.user_wishlist DROP CONSTRAINT user_wishlist_user_id_fkey;
  END IF;
END $$;

-- 3) Add new foreign key constraints referencing auth.users
ALTER TABLE public.user_cart 
ADD CONSTRAINT user_cart_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_wishlist 
ADD CONSTRAINT user_wishlist_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4) Verify the tables exist and have correct structure
SELECT 'Cart table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_cart' 
ORDER BY ordinal_position;

SELECT 'Wishlist table structure:' as info;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'user_wishlist' 
ORDER BY ordinal_position;

-- 5) Test the foreign key constraints
SELECT 'Foreign key constraints:' as info;
SELECT 
  tc.table_name, 
  tc.constraint_name, 
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('user_cart', 'user_wishlist')
ORDER BY tc.table_name, tc.constraint_name;

SELECT 'Migration completed successfully!' as status;
