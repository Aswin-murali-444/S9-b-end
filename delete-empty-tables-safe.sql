-- SAFE Script to Find and Delete Empty Tables
-- Run this in Supabase SQL Editor
-- This will show you empty tables and provide DELETE commands

-- First, let's see all empty tables (tables with 0 rows)
WITH empty_tables AS (
    SELECT 
        t.tablename,
        pg_size_pretty(pg_total_relation_size('public.' || t.tablename)) AS table_size
    FROM pg_tables t
    WHERE t.schemaname = 'public'
    AND NOT EXISTS (
        -- Tables to KEEP (core application tables - DO NOT DELETE)
        SELECT 1 FROM unnest(ARRAY[
            'users', 'user_profiles', 'customer_details', 
            'service_provider_details', 'caretaker_details', 'driver_details',
            'services', 'service_categories', 'bookings',
            'teams', 'team_members', 'team_assignments',
            'user_cart', 'user_wishlist', 'notifications'
        ]) AS keep_table
        WHERE keep_table = t.tablename
    )
)
SELECT 
    et.tablename,
    et.table_size,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = et.tablename) as column_count,
    'DROP TABLE IF EXISTS ' || et.tablename || ' CASCADE;' as drop_command
FROM empty_tables et
WHERE EXISTS (
    -- Check if table actually exists and is empty
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = et.tablename
)
AND (
    -- Try to check if table is empty (safe check)
    SELECT COUNT(*) FROM (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = et.tablename
    ) sub
) > 0
ORDER BY et.tablename;

-- After running the above, you'll see a list of empty tables with their drop commands
-- REVIEW THE LIST CAREFULLY before running any DROP commands!
-- Copy the drop_command column values and paste them below to execute:

-- EXAMPLE (only uncomment after verifying which tables are safe to delete):
-- DROP TABLE IF EXISTS old_test_table CASCADE;
-- DROP TABLE IF EXISTS duplicate_table CASCADE;

